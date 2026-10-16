# Putting Ekhaya FC on Google Play

## 1. One-time laptop setup (Android 16 / API 36 is required by Google Play)

```bash
cd ~/myapp/ekhaya-fc-app && git pull
# Android build tools 36 and platform 36
sdkmanager "build-tools;36.0.0" "platforms;android-36"
# Gradle 8.14.2
mkdir -p ~/.local/gradle/8.14.2 && cd ~/.local/gradle/8.14.2
wget https://services.gradle.org/distributions/gradle-8.14.2-bin.zip && unzip -q gradle-8.14.2-bin.zip
# Cordova Android 15 (targets API 36)
cd ~/myapp/ekhaya-fc-app/cordova && npm install && npx cordova platform rm android && npx cordova platform add android@15.1.0
```

## 2. Build the file Google Play needs (.aab)

```bash
cd ~/myapp/ekhaya-fc-app
read -s EKHAYA_KEYSTORE_PASSWORD && export EKHAYA_KEYSTORE_PASSWORD
npm run build:android:play
```

The signed bundle is saved to `release/EkhayaFC.aab` (never committed). Keep
`~/ekhaya-keys/ekhaya-release.jks` and its password safe: every future update
must be signed with the same key. In Play Console choose **Play App Signing**
(Google keeps the app-signing key; your keystore is the upload key).

## 3. Play Console answers

| Section | Answer |
|---|---|
| App name | Ekhaya FC |
| Package | `mw.ekhayafc.app` |
| Category | Sports |
| Privacy policy | https://ekhaya-fc-app.web.app/privacy.html |
| Delete account URL | https://ekhaya-fc-app.web.app/delete-account.html |
| App access | **Some features are restricted** — give reviewers a test fan account (email + password). Everything needs sign-in. |
| Ads | No ads |
| Target audience | 13 and over |
| Content rating | Fill the IARC questionnaire: no violence, no gambling (predictions are free, no prizes for money), users can interact (names on predictions/Fan Family) |
| Financial features | None while membership shows "Coming soon" |

### Data safety form

Data is encrypted in transit: **Yes**. Users can request deletion: **Yes**. Data sold: **No**.

| Data type | Collected | Shared | Why | Optional? |
|---|---|---|---|---|
| Name | Yes | No | Account management, app functionality | Required |
| Email address | Yes | No | Account management | Required |
| Phone number | Yes | No | Account management | Optional |
| Photos (profile photo) | Yes | No | App functionality | Optional |
| Other user-generated content (predictions, votes, reactions, check-ins) | Yes | No | App functionality | Optional |
| Device or other IDs (notification token) | Yes | No | App functionality (alerts) | Optional |
| Crash logs / diagnostics (error reports) | Yes | No | Analytics (fixing bugs) | Required |

When membership payments are switched on, add **Purchase history** (collected,
shared with PayChangu as a payment processor) and update the form.

## 4. Before you press "Send for review"

- [ ] Admin → App health: **Membership payments** switch is OFF (shows "Coming soon").
- [ ] Create the reviewer test account and confirm its email.
- [ ] Screenshots: at least 2 phone screenshots (Home, Live match, Table, Squad).
- [ ] Feature graphic 1024×500 and the 512×512 icon (`public/pwa-icon-512.png`).
- [ ] Start with **Internal testing** (up to 100 testers) before Production.
- [ ] New personal developer accounts must run a **closed test with at least 12 testers for 14 days** before Production is unlocked.
