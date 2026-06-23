# Punchly — Android Deployment Step-by-Step Guide

Follow this top to bottom. Don't skip any step. Each step says how long it
takes. Total: about 2-3 hours the first time (mostly waiting for downloads),
then 15 min per future release.

Legend:
- 🔧 **One-time setup** — do this only on your first build
- 🔁 **Every build** — repeat this for each new release
- ⚠ **Pitfall** — common mistake, read carefully

---

# PART 1 — Install Everything (🔧 one-time, ~45 min)

## Step 1.1: Verify what you already have

Open **Command Prompt** (Windows key → type "cmd" → Enter). Run one at a time:

```
node --version
git --version
java --version
```

Expected:
- `node` → v18.x or higher. If "not recognized" → install from https://nodejs.org/en/download (pick the LTS button)
- `git` → 2.x.x. If "not recognized" → install from https://git-scm.com/download/win
- `java` → will likely say "not recognized" — that's OK, Android Studio brings its own

## Step 1.2: Install Android Studio (the big one)

1. Open browser → go to **https://developer.android.com/studio**
2. Click **Download Android Studio** → accept terms → download starts.
   File is ≈1.1 GB. 5-15 min depending on your internet.
3. Run the downloaded `.exe` installer.
4. Click **Next** through every screen. Default settings are correct.
   Install location: leave as default.
5. After install, launch Android Studio.
6. First-run wizard appears:
   - **Welcome screen** → Next
   - **Install Type** → choose **Standard** → Next
   - **Select UI Theme** → pick whichever (Dracula looks nice) → Next
   - **Verify Settings** → Next
   - **License Agreement** → click each license on the left → choose **Accept**
     on the right → repeat for all → Finish
7. It downloads the Android SDK (≈2-3 GB). 10-20 min. Let it finish.
8. When the welcome screen with "New Project / Open" buttons appears →
   close Android Studio. Done with this step.

## Step 1.3: Set environment variables (CRITICAL — don't skip)

This is the step most people skip, then get cryptic "JAVA_HOME not set" or
"adb not found" errors later. Do it properly now.

1. Press **Windows key**, type `environment variables`, click
   **Edit the system environment variables**.
2. In the dialog → click **Environment Variables...** button (bottom right).
3. Under **System variables** (lower section) → click **New...**
   - Variable name: `JAVA_HOME`
   - Variable value: `C:\Program Files\Android\Android Studio\jbr`
   - Click OK
4. Click **New...** again.
   - Variable name: `ANDROID_HOME`
   - Variable value: `C:\Users\jaihi\AppData\Local\Android\Sdk`
   - Click OK
5. Under **System variables** → find the row called **Path** → click it →
   click **Edit...**
6. Click **New** → paste: `%JAVA_HOME%\bin`
7. Click **New** again → paste: `%ANDROID_HOME%\platform-tools`
8. Click OK on every dialog to close.
9. ⚠ **Close all open Command Prompt windows.** Env vars only load in
   fresh shells.
10. Open a **brand new** Command Prompt and verify:
    ```
    echo %JAVA_HOME%
    echo %ANDROID_HOME%
    java --version
    ```
    All three should print sensible values. If `java --version` still fails:
    - Open `C:\Program Files\Android\Android Studio\` in File Explorer
    - Look for the folder name: could be `jbr` (most likely) or `jre`
    - Whichever exists, that's the value JAVA_HOME should point to. Go back
      to step 3 and fix it.

---

# PART 2 — Get the Code (🔧 one-time)

## Step 2.1: Clone the repo

```
cd C:\Users\jaihi
git clone https://github.com/karthikeyadev2025-cloud/smart-timekeeper.git
cd smart-timekeeper
```

If you cloned earlier, just:
```
cd C:\Users\jaihi\smart-timekeeper
git pull
```

## Step 2.2: Install dependencies

```
npm install
```

Takes 2-5 min. Don't worry about deprecation warnings.

---

# PART 3 — Build a Debug APK (🔁 every build, ~10 min first time, ~3 min after)

A "debug APK" is for testing on your own phone. NOT for the Play Store.
The Play Store needs a *signed release* APK — we'll do that in Part 5.

## Step 3.1: Sync Capacitor (only needed if capacitor.config or plugins changed)

```
npm run cap:sync
```

You'll see: "Sync finished in 0.2s" or similar.

## Step 3.2: Build the debug APK

```
npm run android:debug
```

First time: 5-10 min (Gradle downloads ~500MB of dependencies, you'll see lots
of `Downloading ...` lines). Future runs: 1-3 min.

When it finishes, last line says: **`BUILD SUCCESSFUL`**.

If it fails: scroll up, find the line starting with `FAILURE:` or `> Task`. Most
common failures:
- `SDK location not found` → ANDROID_HOME env var wrong (go back to Step 1.3)
- `JAVA_HOME not set` → same
- `Could not resolve all dependencies` → internet hiccup, just re-run the command

## Step 3.3: Find the APK

Location:
```
C:\Users\jaihi\smart-timekeeper\android\app\build\outputs\apk\debug\app-debug.apk
```

This file is ≈8 MB. That's normal — most of the app loads from your live site.

## Step 3.4: Install on your phone

**Easiest method (no USB needed):**
1. Upload `app-debug.apk` to your Google Drive
2. On your phone, open Drive, find the file, tap to download
3. Open the downloaded file from your phone's notifications
4. Phone says "Install blocked / Unknown apps" → tap **Settings** → enable
   "Allow from this source" → back → **Install**
5. Open the Punchly app. You should see:
   - Splash screen (indigo with checkmark)
   - Then your login page

**Alternative — USB direct install:**
1. Enable Developer Options on your phone:
   - Settings → About phone → tap "Build number" 7 times in quick succession
2. Settings → System → Developer Options → enable **USB Debugging**
3. Plug phone to PC via USB. Phone shows "Allow USB debugging?" → check
   "Always allow from this computer" → **Allow**
4. Back in Command Prompt:
   ```
   cd C:\Users\jaihi\smart-timekeeper\android
   gradlew installDebug
   ```
   App installs and you can launch from your phone's app drawer.

## Step 3.5: Test the app end-to-end

Open Punchly on your phone and verify:
1. ✅ Splash screen shows (indigo + checkmark)
2. ✅ Login page loads
3. ✅ Log in as RITHVIKA admin
4. ✅ Staff page → tap a staff name → goes to detail page
5. ✅ Check-in: location permission prompt appears → allow
6. ✅ Check-in: camera permission prompt appears → allow
7. ✅ Selfie captures, GPS shows accuracy < 30m (native GPS is way better
       than browser)

If ALL of these work → you're ready for Play Store.

---

# PART 4 — Privacy Policy URL (🔧 one-time, required by Play Store)

Play Store will REJECT your app if you don't have a working privacy policy
URL. We already built the page; you just need to make sure it's reachable.

## Step 4.1: Point DNS for punchly.online

1. Log into Vercel: https://vercel.com → your project (smart-timekeeper)
2. Settings → Domains → click **Add**
3. Type `punchly.online` → click Add
4. Vercel shows DNS records to set. Usually:
   - A record: `76.76.21.21` for `@` (root domain)
   - CNAME: `cname.vercel-dns.com` for `www`
5. Log into your domain registrar (where you bought punchly.online) → DNS
   settings → add those records
6. Wait 5-30 minutes for DNS propagation

Verify by opening **https://punchly.online/privacy** in a browser. Should
show the privacy page (not a 404, not Vercel's default page).

## Step 4.2: Test the required URLs

These three URLs are all needed for Play Store. Open each in a browser and
make sure they load:

- https://punchly.online/privacy
- https://punchly.online/terms
- https://punchly.online/support

If any of them 404 → your Vercel deployment is incomplete. Trigger a
redeploy: Vercel → Deployments → "..." menu on the latest → Redeploy.

---

# PART 5 — Generate the Signing Key (🔧 one-time, BACK THIS UP)

The Play Store requires every release APK to be cryptographically signed
with a "keystore". This proves future updates come from the same publisher.

⚠ **If you lose your keystore, you can never update your Play Store app
again.** You'll have to publish a brand-new app and lose all your users.
TAKE THE BACKUP STEP SERIOUSLY.

## Step 5.1: Create the keystore

In Command Prompt:

```
cd C:\Users\jaihi\smart-timekeeper
keytool -genkey -v -keystore punchly-release.keystore -alias punchly -keyalg RSA -keysize 2048 -validity 10000
```

It asks you a series of questions. Sample answers:
```
Enter keystore password: <make up a strong password — write it down!>
Re-enter new password: <same>
What is your first and last name? Karthikeya Reddy
What is the name of your organizational unit? Engineering
What is the name of your organization? K2 Adexos Global Technologies
What is the name of your City or Locality? Hyderabad
What is the name of your State or Province? Telangana
What is the two-letter country code for this unit? IN
Is CN=... correct? yes
Enter key password for <punchly>: <press Enter to use same as keystore password>
```

A file `punchly-release.keystore` is now in your project folder.

## Step 5.2: BACK IT UP (do this NOW, not later)

1. Copy `punchly-release.keystore` to **at least two other places**:
   - Google Drive (in a folder called "Punchly App Keystore - DO NOT DELETE")
   - A USB drive
   - Email it to yourself as an attachment
2. Also save a text file containing the **keystore password**. Put it in
   the same backup locations. Without the password, the keystore is useless.

⚠ **DO NOT commit the keystore to GitHub.** Our `.gitignore` already
blocks `*.keystore`, but verify:
```
git status
```
Should NOT list `punchly-release.keystore`. If it does → STOP and tell me.

---

# PART 6 — Build a Signed Release APK / AAB (🔁 every release)

The Play Store accepts both APK and AAB (Android App Bundle). AAB is preferred
— smaller download size for users. We'll build both.

## Step 6.1: Configure signing in Gradle

This makes Gradle use your keystore automatically. Do this ONCE.

1. Open this file in a text editor (Notepad++, VS Code, anything):
   ```
   C:\Users\jaihi\smart-timekeeper\android\app\build.gradle
   ```
2. Find the section starting with `android {`. Inside it, ABOVE the line
   `buildTypes {`, paste this:
   ```
       signingConfigs {
           release {
               storeFile file('../../punchly-release.keystore')
               storePassword 'YOUR_KEYSTORE_PASSWORD_HERE'
               keyAlias 'punchly'
               keyPassword 'YOUR_KEYSTORE_PASSWORD_HERE'
           }
       }
   ```
   Replace `YOUR_KEYSTORE_PASSWORD_HERE` (both places) with the password you
   chose in Step 5.1.
3. Inside `buildTypes { release { ... } }`, add:
   ```
       signingConfig signingConfigs.release
   ```
4. Save the file.

⚠ This file IS committed to git. Hardcoding the password is fine for a
single-developer project but if you ever open-source the code, move the
password to an environment variable instead.

## Step 6.2: Build the AAB (for Play Store)

```
cd C:\Users\jaihi\smart-timekeeper
npm run cap:sync
cd android
gradlew bundleRelease
```

Takes 3-5 min. When done, your AAB is at:
```
C:\Users\jaihi\smart-timekeeper\android\app\build\outputs\bundle\release\app-release.aab
```

This is the file you upload to Play Store.

## Step 6.3: Build the APK (if you want, for sideloading)

```
gradlew assembleRelease
```

APK at: `android\app\build\outputs\apk\release\app-release.apk`

---

# PART 7 — Play Store Console Setup (🔧 one-time, ~30 min)

## Step 7.1: Register as a Google Play developer

1. Go to **https://play.google.com/console**
2. Sign in with the Google account you want associated with the developer name
3. **One-time fee: $25 USD** (≈₹2,100). Pay by card.
4. Fill in account details:
   - Developer name (PUBLIC): **K² Adexos Global Technologies**
     ⚠ Choose carefully — appears on every listing, hard to change later.
   - Email: support@punchly.online (or whichever you'll monitor)
   - Phone: your number
   - Address: Hyderabad, Telangana, India
5. Verify your phone via SMS. Verify your email.
6. Google may ask for ID verification (PAN/Aadhaar) — submit when asked,
   takes 1-3 days. You can start preparing the listing while waiting.

## Step 7.2: Create the app

1. Play Console home → **Create app**
2. Fill in:
   - App name: **Punchly: Smart Attendance**
   - Default language: **English (India) – en-IN**
   - App or game: **App**
   - Free or paid: **Free**
   - Check both declarations (apps & content policies)
3. Click **Create app**

## Step 7.3: Fill in the listing (this takes 20 min)

Open the file **PLAY_STORE_LISTING.md** (you have it). Each section in that
file maps to a Play Console field. Copy-paste each:

In Play Console left sidebar → **Grow → Store presence → Main store listing**:

| Field | Value (from PLAY_STORE_LISTING.md) |
|---|---|
| App name | Punchly: Smart Attendance |
| Short description | (copy from md file) |
| Full description | (copy from md file) |
| App icon | upload `punchly_assets/play_store/icon_512.png` |
| Feature graphic | upload `punchly_assets/play_store/feature_graphic_1024x500.png` |
| Phone screenshots | upload your 4-8 phone screenshots |
| Application type | App |
| Category | Business |
| Tags | (copy from md file) |
| Contact email | support@punchly.online |
| Contact website | https://punchly.online |
| Contact phone | (optional — leave blank unless you want users to call you) |
| Privacy Policy | https://punchly.online/privacy |

## Step 7.4: Take phone screenshots

You need at least **2 screenshots**, maximum 8. They must be:
- Portrait, minimum 1080 × 1920 pixels
- Not a mock-up — actual screenshots of the app

How:
1. Install your debug APK from Part 3 on your phone
2. Open each screen listed below
3. Power + Volume Down → captures screenshot
4. Screenshots auto-save to your phone's gallery
5. Email them to yourself or upload to Drive to get them onto your computer

Screens to capture:
1. **Login page** (the public landing)
2. **Dashboard** (Today screen with attendance count + leaves)
3. **Check-in screen** (with selfie + GPS verified badge)
4. **Staff list** (showing profile completion bars + avatars)
5. **Staff detail page** — Profile tab
6. **Staff detail page** — Bank tab
7. **Payroll** (with Pay buttons)
8. **Bank approvals** queue

## Step 7.5: Fill in Data Safety section

Play Console left sidebar → **Policy → App content → Data safety**.

This is a long form. **Use the "DATA SAFETY DECLARATION" section in
PLAY_STORE_LISTING.md** — tick exactly the boxes listed there.

Key answers:
- Does your app collect or share user data? **YES**
- Is all user data encrypted in transit? **YES**
- Can users request data deletion? **YES** (provide the URL https://punchly.online/support)

## Step 7.6: Content rating

Sidebar → **Policy → App content → Content rating**.

1. Click **Start questionnaire**
2. Email: support@punchly.online
3. Category: **Productivity / Business**
4. Answer all questions HONESTLY. Most will be "No" for Punchly:
   - Violence? No
   - Sexuality? No
   - Profanity? No
   - Controlled substances? No
   - User-generated content? **Yes** (staff upload selfies)
   - User-to-user communication? No
   - Personal info sharing? **Yes** (between admin and staff in the same org)
   - Location sharing? **Yes** (with the company admin, for attendance)
   - In-app purchases? **Yes** (subscription plans via Razorpay)
5. Submit. You get a rating like "Everyone" or "PEGI 3" — both fine.

## Step 7.7: Target audience

Sidebar → **Policy → App content → Target audience and content**.

Target age range: **18+** (it's a business app for adults).
"Is your app appealing to children?" → No.

## Step 7.8: App access

Sidebar → **Policy → App content → App access**.

"All or some functionality is restricted" → **YES, restricted**.
Provide test credentials for Google's reviewer:
- Username: a test phone number you own
- Password: PIN for that test account
- Notes: "Login with phone number + PIN. Use these credentials to access
  the admin dashboard."

Make sure that test account actually works! Reviewers will try it.

## Step 7.9: Upload the AAB

Sidebar → **Production → Create new release**.

1. **App bundles** section → upload `app-release.aab` (from Step 6.2)
2. **Release name**: auto-fills (e.g., "1 (1.0)") — leave it
3. **Release notes**: type something like:
   ```
   First release. GPS + selfie attendance, payroll, leaves, and bank-change
   fraud protection for Indian businesses.
   ```
4. Click **Next** → review → **Save**

## Step 7.10: Submit for review

Once everything has green check marks in the left sidebar (Store listing,
Data safety, Content rating, App access, Target audience):

Sidebar → **Production → Releases overview** → **Send for review**.

Google reviews in **3 to 7 days**. They'll either approve (app goes live)
or send a rejection email explaining what to fix.

Most common rejection reasons:
- Privacy policy URL broken → fix DNS
- Data safety doesn't match actual app behavior → re-check declarations
- Test credentials don't work → fix and resubmit

---

# PART 8 — After Approval

You'll get an email "Punchly: Smart Attendance is live on Google Play".
Your link:
```
https://play.google.com/store/apps/details?id=online.punchly.app
```

Share this everywhere — your website, WhatsApp, social media.

## Future releases

When you want to push an update:

1. Make whatever code changes you want
2. Push to git → Vercel auto-deploys the website
3. Bump the version in `android/app/build.gradle`:
   - Find `versionCode 1` → change to `versionCode 2`
   - Find `versionName "1.0"` → change to `versionName "1.1"`
4. Build a new AAB:
   ```
   npm run cap:sync
   cd android
   gradlew bundleRelease
   ```
5. In Play Console → **Production → Create new release** → upload new AAB
6. Add release notes → Save → Send for review (faster reviews after the first)

⚠ Reminder: 95% of changes to your website don't need an app rebuild —
they're picked up live next time someone opens the app. Only rebuild when:
- You change `capacitor.config.ts`
- You add a new native plugin
- You change Android permissions
- You change the app icon
- You bump for a regulatory store update

---

# Troubleshooting

**"BUILD FAILED — SDK location not found"**
ANDROID_HOME is wrong. Re-do Step 1.3.

**"JAVA_HOME not set"**
JAVA_HOME is wrong. Re-do Step 1.3.

**"Could not find tools.jar"**
You're using a JDK that's too old. Make sure JAVA_HOME points to Android
Studio's bundled `jbr`, not some other Java install.

**APK installed but app shows blank white screen**
Your DNS isn't pointing punchly.online to Vercel yet, or the Vercel
deployment is broken. Test by opening https://punchly.online in your
phone's regular browser — should show your login. If it doesn't, fix Vercel
first.

**"App not installed" error on phone**
- You're trying to install a debug APK over a release APK (or vice versa) —
  uninstall the existing one first
- Phone storage full

**Selfie or GPS doesn't work in the app**
- First check: in your phone's Settings → Apps → Punchly → Permissions,
  are Camera and Location both granted?
- If still broken after granting: it's a code bug, ping me

**Play Store says "Privacy policy URL is invalid"**
Open https://punchly.online/privacy in incognito mode. It must load WITHOUT
needing login. If it 404s, your Vercel deploy hasn't picked up the new
routes — trigger a redeploy.
