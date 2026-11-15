# TURNI Business Accounts — Secure Sheets Backend v3

## প্রথমে যা জানতে হবে
- এটি Cloudflare Pages Functions-ভিত্তিক এক ব্যবহারকারীর Google Sheets snapshot sync।
- Google Sheets `AppState` নামে একটি tab লাগবে। A1 `revision`, B1 `json`, C1 `updated_at` লিখুন। A2-তে `0` দিন। B2/C2 খালি রাখুন।
- এটি per-order relational database নয়; এক সেলে JSON snapshot রাখা হয়। Google Sheets প্রতি সেলের সীমা প্রায় 50,000 অক্ষর, তাই বড় ডেটাবেসের জন্য এটি উপযুক্ত নয়।
- একাধিক ডিভাইস/ব্যবহারকারী একই সময়ে edit করবেন না। revision check race-proof নয়।
- Steadfast booking/settlement এখনো যুক্ত নয়।

## ধাপ ১: Google Cloud
1. console.cloud.google.com এ নতুন Project তৈরি করুন।
2. APIs & Services > Library থেকে Google Sheets API Enable করুন।
3. IAM & Admin > Service Accounts > Create Service Account।
4. Service Account > Keys > Add Key > Create new key > JSON। JSON ফাইল নিরাপদে রাখুন।
5. Google Sheet-এর Share-এ service account `client_email`-কে Editor দিন।
6. Spreadsheet URL থেকে `/d/` ও `/edit` এর মাঝের ID কপি করুন।

## ধাপ ২: Cloudflare Pages
1. GitHub-এ এই ZIP-এর ফাইলগুলো upload করুন (ZIP নয়)।
2. Cloudflare > Workers & Pages > আপনার Pages Project > Settings > Variables and Secrets।
3. `SHEET_ID` (text), `GOOGLE_SERVICE_ACCOUNT_JSON` (Secret; সম্পূর্ণ JSON এক লাইনে), `ACCESS_TEAM_DOMAIN` (text; যেমন `your-team.cloudflareaccess.com`), `ACCESS_AUD` (text; Access Application AUD tag) দিন।
4. Cloudflare Zero Trust > Access > Applications > Add application > Self-hosted; আপনার `*.pages.dev` hostname protect করুন। Policy: Allow only your own email; one-time PIN বা identity provider ব্যবহার করুন।
5. Access Application-এর Overview থেকে Application AUD tag কপি করে `ACCESS_AUD` দিন।
6. Pages-এ Redeploy করুন। Build command ফাঁকা, output directory `/` (project root) রাখুন। Functions স্বয়ংক্রিয়ভাবে deploy হবে।
7. Login করে `https://YOUR-SITE.pages.dev/api/health` খুলুন; `{"ok":true,"access":"verified"}` দেখা উচিত।
8. `/api/state` খুলে revision 0 ও state null নিশ্চিত করুন।
9. অ্যাপ খুলে `নতুন খালি হিসাব` অথবা `পুরোনো হিসাব Import` নির্বাচন করুন। প্রথমবার ভুল import এড়াতে আগে JSON Backup রাখুন।

## নিরাপত্তা
- কখনো Google private key, Steadfast key GitHub-এ দেবেন না।
- Access শুধু UI নয়, API-ও protect করবে; backend JWT signature ও AUD যাচাই করে।
- Browser localStorage-এ cached business data থাকে। Shared device ব্যবহার করবেন না।
- Offline editing বন্ধ; ইন্টারনেট ছাড়া নতুন হিসাব save হবে না।
- Sheets এক-সেল JSON সীমা, simultaneous write এবং migration constraints আছে। Production-grade multiuser ledger/Steadfast settlement-এর আগে D1/transactional database migration প্রয়োজন।
