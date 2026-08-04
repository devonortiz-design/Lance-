import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App.jsx"

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

ReactDOM.createRoot(document.getElementById("root")).render(
  React.createElement(ErrorBoundary, null, React.createElement(App))
)
