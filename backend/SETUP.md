# Backend setup (about 5 minutes, one time)

The ratings live in a private Google Sheet in your account. A small Apps Script attached to that Sheet
receives ratings and photos from everyone's phones. The script runs as you, so no Google credentials
ever go into this repo or the app.

The Sheet (**All the Joes — Ratings**) and the Drive folder (**All the Joes — Photos**) are already
created in your Google Drive, with these tabs: `Ratings`, `Locations`, `Photos`, `Weights`.

## 1. Paste the script
1. Open the **All the Joes — Ratings** Sheet.
2. **Extensions → Apps Script**.
3. Delete the starter code, paste in all of [`Code.gs`](Code.gs), and click **Save** (💾).

## 2. Set the passcode and photo folder (kept out of the code)
1. In Apps Script, click **Project Settings** (⚙️ on the left).
2. Under **Script Properties**, click **Add script property** twice:
   | Property | Value |
   |---|---|
   | `PASSCODE` | a family passcode of your choice, such as a phrase only the family knows |
   | `PHOTO_FOLDER_ID` | the ID of the **All the Joes — Photos** folder: the long code after `/folders/` in its Drive URL |
3. **Save script properties**.

## 3. Deploy as a web app
1. **Deploy → New deployment**. Click the ⚙️ next to "Select type" and choose **Web app**.
2. **Execute as:** Me. **Who has access:** Anyone.
3. **Deploy**. Google asks you to authorize: choose your account. If you see "Google hasn't verified this app",
   click **Advanced → Go to (project name)**. That's expected for your own script.
4. Copy the **Web app URL** (ends in `/exec`).

## 4. Connect the app
1. Paste the URL into `SCRIPT_URL` in [`app/api.js`](../app/api.js), or send it to Claude to do it.
   This URL isn't secret by itself: without the passcode it can't read or write anything.
2. Open `app/connection-test.html`, enter the passcode, and try **Load data** and **Submit test rating**.
   A new row should appear in the `Ratings` tab.

## Notes
- **Changing the script later:** use **Deploy → Manage deployments → ✏️ → Version: New version**.
  This keeps the same URL.
- **Weights and locations** can be edited directly in the `Weights` and `Locations` tabs.
- **Photos** are shrunk on the phone before upload. They're saved in the Photos folder with "anyone with the link
  can view" sharing, so phones can show them. The links are long and random and are only returned to
  people with the passcode.
- **Changing the passcode:** edit `PASSCODE` in Script Properties. Everyone re-enters the new one.
- **Christmas N/A:** a blank `xmas` cell means N/A. The overall score skips it and scales the other weights up.
