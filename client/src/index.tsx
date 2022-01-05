import "./polyfills";
import React, { useState } from "react";
import ReactDOM from "react-dom";
import { HashRouter, Routes, Route, Link } from "react-router-dom";
import { Provider } from "react-redux";

import Home from "./routes/home";
import Keygen from "./routes/keygen";
import Sign from "./routes/sign";

import store from "./store";
import { setGroup } from "./store/group";

import WebSocketProvider from "./websocket";
import WorkerProvider from "./worker-provider";

const NotFound = () => <h3>Page not found</h3>;

const App = () => {
  if (window.Worker) {
    return (
      <>
        <h1>
          <a href="/">ECDSA WASM Demo</a>
        </h1>
        <p>Using the gg18 protocol, signing initiated on (threshold + 1)</p>
        <hr />
        <WorkerProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/keygen/:uuid" element={<Keygen />} />
            <Route path="/sign/:address" element={<Sign />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </WorkerProvider>
      </>
    );
  } else {
    return <p>Your browser does not support web workers.</p>;
  }
};

ReactDOM.render(
  <React.StrictMode>
    <Provider store={store}>
      <HashRouter>
        <WebSocketProvider>
          <App />
        </WebSocketProvider>
      </HashRouter>
    </Provider>
  </React.StrictMode>,
  document.querySelector("main")
);
