# HomeRail Agent UI

Vue 3 Agent Shell for the local HomeRail Manager. The default UI contains the text Agent view, the Voice Agent cockpit, and the shared settings page opened from the top-right controls.

Run it through the HomeRail CLI:

```bash
node homerail_cli/dist/cli.js ui start
```

The CLI starts HTTPS as the primary UI endpoint and keeps an HTTP fallback for
compatibility. Fresh defaults are `https://localhost:19192` and
`http://localhost:19193`. Local self-signed certificates are generated under
`${HOMERAIL_HOME}/certs` and are not stored in the repo.

Text mode is temporarily disabled by default, so `/agent` opens the Voice Agent
cockpit directly. Use `node homerail_cli/dist/cli.js ui start --enable-text-mode`
only when you need the text Agent shell during local debugging.
