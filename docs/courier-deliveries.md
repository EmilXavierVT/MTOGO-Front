# Buddets leveringsinterface

Frontend [#16](https://github.com/EmilXavierVT/MTOGO-Front/issues/16) implementerer
[MTOGO #57](https://github.com/EmilXavierVT/MTOGO/issues/57). `/courier` kræver
backendvalideret `COURIER`-login gennem den eksisterende `RequiredRole`.
Backendens [API-kontrakt](https://github.com/EmilXavierVT/MTOGO/blob/main/docs/courier-delivery-api.md)
beskriver felter, roller og ejerskab. Backend skal leveres først.

- Ledige leveringsklare ordrer viser ordre-ID, restaurant og afhentningsadresse.
- Overtagelse viser egen aktive levering med kundens gemte navn, telefon som
  ringelink og leveringsadresse. En aktiv levering genfindes ved genindlæsning.
- `CLAIMED` tilbyder **Markér som afhentet**. `UNDER_DELIVERY` tilbyder
  **Markér som leveret**. Andre overtagelser er deaktiveret, mens der er en aktiv levering.
- **Opdatér oversigt** henter nye data. Der er ingen automatisk reservation,
  kortvisning eller ruteplanlægning.
- Alle handlingsknapper deaktiveres under requests. Efter handlinger, konflikter
  og netværksfejl hentes både egen aktive levering og ledige ordrer igen.
  Hvis genindlæsningen fejler, skjules de gamle handlinger indtil en vellykket
  manuel opdatering. En usikker POST gentages ikke automatisk.
- `409` vises på dansk, fx **En anden har allerede overtaget ordren**.
  `401` rydder token/rolle fra begge sessionlagre og sender brugeren til login.
  Indlæsning, tomme lister og øvrige fejl vises særskilt.

UI-tests bruger den rigtige side og rollebeskyttelse med HTTP-svar som testgrænse.
Backendens HTTP-tests dækker adgang og de konkrete DTO'er på PostgreSQL i CI
og på H2 ved almindelige lokale checks. De eksisterende samtidighedstests i
backend bruger fortsat H2.

```sh
npm test -- tests/courier.test.jsx
./scripts/check.sh quick
```
