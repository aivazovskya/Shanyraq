# Mobile UI preview

Run `npm run preview:ui` from `mobile`, then open http://localhost:8182.

This separate Expo entry renders the real resident screens with synthetic data.
It does not use production credentials. All network requests are blocked and
unmocked actions fail. It is excluded from the normal app entry and builds.

Use it to review the dashboard, request filters and details, account selection,
charge / payment tabs, access points, meetings, profile, chat, and notifications.
Household fixtures also cover meter validation and an empty second apartment,
occupied booking slots, an availability error, an empty waitlist, and listing
filters. All form submissions fail locally; no real data is written.
Report fixtures add important news, closed SOS calls, a recorded vote, a zero
month, and a report loading error. Vote submission remains blocked.
Property fixtures cover search and a complex without units. Open
`http://localhost:8182/?pinStatus=error` to review a failed PIN status check;
return to `/` to restore the normal fixture. PIN changes and pass creation are
never mocked as successful and remain blocked from reaching any server.
Notification read states are updated only in fixture memory and reset on reload.
Sending a chat message fails locally so draft retention can be checked.
Native device behavior still requires Android or iOS testing.

Staff home, requests and inbox can be reviewed with `?role=HOA_ADMIN`,
`?role=DISPATCHER`, `?role=SECURITY` or `?role=HOA_CHAIRMAN`. This changes only
the injected fixture profile; real authorization is unchanged.

Append `&failure=offline` or `&failure=timeout` to a role URL to simulate
transport failures on unmocked actions. Reads still use fixtures.
