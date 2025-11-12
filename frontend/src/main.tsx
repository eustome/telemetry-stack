import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import app from "./App";

const container = document.getElementById("root");

if (!container) {
  throw new Error("root element not found");
}

const root = ReactDOM.createRoot(container);

root.render(React.createElement(app));

