import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App.jsx"
import { getLanceKey, setLanceKey, checkLanceKey } from "./config"

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(e) {
    return { error: e }
  }
  componentDidCatch(e, info) {
    console.error("Lance error:", e, info)
  }
  render() {
    if (this.state.error) {
      return React.createElement("div", {
        style: {
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0d1321",
          padding: "40px",
          textAlign: "center",
          fontFamily: "sans-serif"
        }
      },
        React.createElement("div", { style: { color: "#C9A84C", fontSize: "32px", marginBottom: "16px" } }, "!"),
        React.createElement("div", { style: { color: "#fff", fontSize: "18px", fontWeight: 600, marginBottom: "8px" } }, "Lance hit an error"),
        React.createElement("div", { style: { color: "rgba(255,255,255,0.5)", fontSize: "13px", marginBottom: "24px", wordBreak: "break-word" } }, this.state.error.message),
        React.createElement("button", {
          onClick: () => { this.setState({ error: null }); window.location.reload() },
          style: {
            background: "linear-gradient(135deg,#C9A84C,#a07830)",
            border: "none", borderRadius: "12px", color: "#fff",
            padding: "12px 28px", fontSize: "15px", fontWeight: 600, cursor: "pointer"
          }
        }, "Reload Lance")
      )
    }
    return this.props.children
  }
}


// Asks for the unlock passcode once per device. Lance's data stays locked
// behind the lance-db gateway until the passcode checks out.
function UnlockGate() {
  const h = React.createElement
  const [state, setState] = React.useState(getLanceKey() ? "checking" : "locked")
  const [code, setCode] = React.useState("")
  const [msg, setMsg] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (state !== "checking") return
    checkLanceKey(getLanceKey()).then(r => {
      if (r === "locked") { setLanceKey(""); setMsg("This device's passcode stopped working. Enter the current one."); setState("locked") }
      else setState("open") // offline still opens Lance; calls retry on their own
    })
  }, [state])

  const submit = async (e) => {
    e.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true); setMsg("")
    const r = await checkLanceKey(code)
    setBusy(false)
    if (r === "ok") { setLanceKey(code); setState("open") }
    else if (r === "locked") setMsg("That passcode didn't match. Check the spelling and dashes.")
    else setMsg("Lance can't reach the server. Check your connection and try again.")
  }

  if (state === "open") return h(App)
  const wrap = { height: "100%", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d1321", padding: "24px", fontFamily: "-apple-system, system-ui, sans-serif" }
  if (state === "checking") return h("div", { style: wrap }, h("div", { style: { color: "rgba(255,255,255,0.6)", fontSize: "15px" } }, "Opening Lance…"))
  return h("div", { style: wrap },
    h("form", { onSubmit: submit, style: { width: "100%", maxWidth: "340px", display: "flex", flexDirection: "column", gap: "14px", textAlign: "center" } },
      h("div", { style: { color: "#C9A84C", fontSize: "28px", fontWeight: 700, letterSpacing: "0.02em" } }, "Lance"),
      h("div", { style: { color: "rgba(255,255,255,0.75)", fontSize: "15px", lineHeight: 1.45 } }, "Enter your unlock passcode. This device remembers it after the first time."),
      h("input", { id: "lance-unlock", value: code, onChange: e => setCode(e.target.value), autoFocus: true, autoCapitalize: "none", autoCorrect: "off", spellCheck: false, autoComplete: "current-password", type: "password", placeholder: "word-word-word-word-123",
        style: { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(201,168,76,0.4)", borderRadius: "12px", color: "#fff", padding: "14px", fontSize: "16px", textAlign: "center", outline: "none" } }),
      msg ? h("div", { style: { color: "#f2a98f", fontSize: "13px" } }, msg) : null,
      h("button", { type: "submit", disabled: busy, style: { background: "linear-gradient(135deg,#C9A84C,#a07830)", border: "none", borderRadius: "12px", color: "#fff", padding: "13px", fontSize: "15px", fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1 } }, busy ? "Checking…" : "Unlock")
    )
  )
}

ReactDOM.createRoot(document.getElementById("root")).render(
  React.createElement(ErrorBoundary, null, React.createElement(UnlockGate))
)
