#!/usr/bin/env python3
"""Publish verified main commits in ancestry order; never rebuild a version on retry."""

import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

import takt

DIGEST = re.compile(r"^Digest:\s+(sha256:[0-9a-f]{64})\s*$", re.MULTILINE)


def digest(reference):
    result = subprocess.run(
        ["docker", "buildx", "imagetools", "inspect", reference],
        cwd=takt.ROOT, capture_output=True, text=True,
    )
    if result.returncode:
        if re.search(r"(manifest unknown|not found)", result.stderr, re.IGNORECASE):
            return None
        raise RuntimeError(f"Cannot inspect {reference}: {result.stderr.strip()}")
    match = DIGEST.search(result.stdout)
    if not match:
        raise ValueError(f"No registry digest returned for {reference}")
    return match[1]


def ensure_tag(image, tag, expected):
    current = digest(f"{image}:{tag}")
    if current:
        if current != expected:
            raise ValueError(f"Refusing to overwrite {image}:{tag}: its digest differs")
        return
    takt.run([
        "docker", "buildx", "imagetools", "create", "--prefer-index=false",
        "--tag", f"{image}:{tag}", f"{image}@{expected}",
    ], capture=False)
    if digest(f"{image}:{tag}") != expected:
        raise ValueError(f"Registry digest verification failed for {image}:{tag}")


def pending_commits(base, main):
    if not takt.SHA.fullmatch(base):
        raise ValueError("Set TAKT_BASE_SHA to the full main SHA at activation")
    takt.git("merge-base", "--is-ancestor", base, main)
    return takt.git("rev-list", "--reverse", "--first-parent", f"{base}..{main}").splitlines()


def existing_version(sha):
    tags = [
        tag for tag in takt.git("tag", "--points-at", sha).splitlines()
        if takt.VERSION.fullmatch(tag)
    ]
    if len(tags) > 1:
        raise ValueError(f"Multiple semantic versions point to {sha}")
    return tags[0] if tags else None


def build_image(image, sha, version=None):
    """Use a separate worktree so builds cannot execute the release coordinator."""
    reference = f"{image}:sha-{sha}"
    existing = digest(reference)
    if existing:
        return existing
    with tempfile.TemporaryDirectory(prefix="takt-image-") as directory:
        context = Path(directory) / "source"
        metadata = Path(directory) / "metadata.json"
        takt.git("worktree", "add", "--detach", str(context), sha)
        try:
            takt.run([
                "docker", "buildx", "build", "--platform", "linux/amd64",
                "--push", "--sbom=true", "--tag", reference,
                "--label", f"org.opencontainers.image.revision={sha}",
                "--label", f"org.opencontainers.image.version={version or sha}",
                "--label", f"org.opencontainers.image.source=https://github.com/{takt.repository()}",
                "--cache-from", f"type=registry,ref={image}:buildcache",
                "--cache-to", f"type=registry,ref={image}:buildcache,mode=max",
                "--metadata-file", metadata, context,
            ], capture=False)
            expected = json.loads(metadata.read_text())["containerimage.digest"]
        finally:
            takt.git("worktree", "remove", "--force", str(context))
    if digest(reference) != expected:
        raise ValueError("Published SHA image does not match build metadata")
    return expected


def publish(image, base):
    repo = takt.repository()
    takt.git("fetch", "origin", "main", "--tags")
    main = takt.git("rev-parse", "FETCH_HEAD")
    for sha in pending_commits(base, main):
        version = existing_version(sha)
        if version:
            if sha != main:
                continue
            # A Git version tag is written only after the matching image is verified.
            expected = digest(f"{image}:sha-{sha}")
            if not expected or digest(f"{image}:{version}") != expected:
                raise ValueError(f"Existing release {version} has inconsistent image tags")
        else:
            plan = takt.verified_plan(repo, sha)
            takt.assert_candidate(sha, plan["parent"])
            version = takt.next_version(takt.latest_version(plan["parent"]), plan["bump"])
            # Never reinterpret a frozen issue plan or move an existing version ref.
            result = subprocess.run(["git", "rev-parse", "--verify", f"refs/tags/{version}"], cwd=takt.ROOT, capture_output=True)
            if result.returncode == 0:
                raise ValueError(f"Version {version} is already allocated to another commit")
            expected = build_image(image, sha, version)
            ensure_tag(image, version, expected)
            message = f"{version}\n\nIssue: {repo}#{plan['issue']}\nCommit: {sha}\nBump: {plan['bump']}\nImage: {image}@{expected}"
            takt.git("-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
                     "tag", "-a", version, sha, "-m", message)
            takt.git("push", "origin", f"refs/tags/{version}")
        # Older queued deliveries still get versions, but cannot move latest backwards.
        if takt.remote_head("main") == sha:
            takt.run(["docker", "buildx", "imagetools", "create", "--prefer-index=false",
                      "--tag", f"{image}:latest", f"{image}@{expected}"], capture=False)
        print(f"Published {version}: {sha} -> {image}@{expected}")


if __name__ == "__main__":
    try:
        publish(os.environ["IMAGE"], os.environ.get("TAKT_BASE_SHA", ""))
    except (RuntimeError, ValueError, KeyError, OSError) as error:
        print(f"Takt publication: {error}", file=sys.stderr)
        sys.exit(1)
