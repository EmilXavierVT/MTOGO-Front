#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-quick}"
if [[ "$#" -gt 1 || ( "$mode" != quick && "$mode" != verify ) ]]; then
  echo "Usage: ./scripts/check.sh [quick|verify]" >&2
  exit 2
fi
command -v python3 >/dev/null || { echo "Install Python 3.11+ (required by Takt)." >&2; exit 1; }
python3 -m unittest discover -s scripts/tests -v
if [[ -f pom.xml ]]; then
  if [[ "$(uname -s)" == Darwin ]]; then
    JAVA_HOME=$(/usr/libexec/java_home -v 17)
    export JAVA_HOME
  fi
  java_bin=java
  if [[ -n "${JAVA_HOME:-}" ]]; then java_bin="$JAVA_HOME/bin/java"; fi
  java_version=$("$java_bin" -version 2>&1)
  if [[ "$java_version" != *'version "17.'* ]]; then
    echo "Use JDK 17: set JAVA_HOME to your Java 17 installation." >&2
    exit 1
  fi
  goals=(test)
  if [[ "$mode" == verify ]]; then
    goals=(verify)
    if [[ "${CI:-false}" == true ]]; then goals=(clean verify); fi
  fi
  ./mvnw -B -ntp "${goals[@]}"
  if [[ "$mode" == verify && ! -s target/site/jacoco/jacoco.xml ]]; then
    echo "JaCoCo coverage report is missing." >&2
    exit 1
  fi
else
  [[ "$(node -p 'process.versions.node.split(".")[0]')" == 24 ]] || {
    echo "Use Node 24 (see .nvmrc)." >&2; exit 1;
  }
  [[ -d node_modules ]] || { echo "Run npm ci once before checking." >&2; exit 1; }
  export NEXT_TELEMETRY_DISABLED=1
  if [[ "$mode" == quick ]]; then npm run check:quick; else npm run check; fi
fi
