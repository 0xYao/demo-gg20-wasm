import "./polyfills";
import React, { useState } from "react";
import ReactDOM from "react-dom";
import WalletConnect from "@walletconnect/client";
import { Transaction } from "@ethereumjs/tx";
import { ecrecover, pubToAddress } from "ethereumjs-util";
import { once, EventEmitter } from "events";

const workerEvents = new EventEmitter();
let addressString: string = null;

interface FormProps {
  onSubmit: (message: string) => void;
}

const isHex = (message: string) => {
  if (message.length % 2 !== 0) return false;
  for (let i = 0; i < message.length; i += 2) {
    const c = message.substr(i, 2);
    if (!/[a-f0-9]{2}/i.test(c)) {
      return false;
    }
  }
  return true;
};

const WalletConnectForm = (props: FormProps) => {
  const [uri, setUri] = useState("");

  const onWalletConnectFormSubmit = (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (uri.trim() === "") {
      return alert("Please enter a message to sign");
    }

    props.onSubmit(uri);
  };

  const onMessageChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    setUri(event.currentTarget.value);
  };

  return (
    <>
      <form onSubmit={onWalletConnectFormSubmit}>
        <textarea
          placeholder="Enter a walletconnect uri (eg: 'wc:8a5e5bdc-a0e4-47...TJRNmhWJmoxdFo6UDk2WlhaOyQ5N0U=')"
          rows={4}
          name="message"
          onChange={onMessageChange}
          value={uri}
        ></textarea>
        <input type="submit" name="Sign" value="Connect" />
      </form>
    </>
  );
};

const SignForm = (props: FormProps) => {
  const [message, setMessage] = useState("");

  const onSignFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (message.trim() === "") {
      return alert("Please enter a message to sign");
    }

    if (!isHex(message)) {
      return alert("Message must be hex encoded");
    }

    props.onSubmit(message);
  };

  const onMessageChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    setMessage(event.currentTarget.value);
  };

  return (
    <>
      <form onSubmit={onSignFormSubmit}>
        <textarea
          placeholder="Enter a hex encoded message to sign (eg: 68656c6c6f20776f726c64)"
          rows={4}
          name="message"
          onChange={onMessageChange}
          value={message}
        ></textarea>
        <input type="submit" name="Sign" value="Submit Proposal" />
      </form>
    </>
  );
};

interface SignProposalProps {
  signMessage: string;
  onSignMessage: (message: string) => void;
  signStatusMessage: string;
}

const SignProposal = (props: SignProposalProps) => {
  const signButtonVisible = props.signStatusMessage === "";

  const onSignMessage = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    props.onSignMessage(props.signMessage);
  };

  return (
    <>
      <pre>{props.signMessage}</pre>
      {signButtonVisible ? (
        <button onClick={onSignMessage}>Sign</button>
      ) : (
        <p>{props.signStatusMessage}</p>
      )}
    </>
  );
};

interface AppProps {
  worker: Worker;
}

const App = (props: AppProps) => {
  const { worker } = props;
  if (worker) {
    const [url, setUrl] = useState(null);
    const [connected, setConnected] = useState(false);
    const [clientId, setClientId] = useState(null);
    const [parties, setParties] = useState(null);
    const [threshold, setThreshold] = useState(null);
    const [partyNumber, setPartyNumber] = useState(null);

    const [keygenSignupVisible, setKeygenSignupVisible] = useState(false);

    const [wcFormVisible, setWcFormVisible] = useState(false);
    const [wcConnected, setWcConnected] = useState(false);

    const [signMessage, setSignMessage] = useState(null);
    const [signStatusMessage, setSignStatusMessage] = useState("");
    const [signFormVisible, setSignFormVisible] = useState(false);
    const [signProposalVisible, setSignProposalVisible] = useState(false);
    const [signResult, setSignResult] = useState(null);

    const [logMessage, setLogMessage] = useState("");

    const onKeygenPartySignup = () => {
      worker.postMessage({ type: "party_signup" });
      setKeygenSignupVisible(false);
    };

    const onWalletConnectFormSubmit = (uri: string) => {
      // worker.postMessage({ type: "sign_proposal", message });
      setSignFormVisible(false);
      setWcFormVisible(false);

      const connector = new WalletConnect({
        uri,
        bridge: "https://bridge.walletconnect.org",
        clientMeta: {
          description: "WalletConnect Developer App",
          url: "https://walletconnect.org",
          icons: ["https://walletconnect.org/walletconnect-logo.png"],
          name: "WalletConnect",
        },
      });

      connector.on("session_request", (error: Error, payload: object) => {
        if (error) {
          throw error;
        }
        console.log("session_request", payload);
        setWcConnected(true);

        // Approve Session
        connector.approveSession({
          accounts: [addressString],
          chainId: 1,
        });
      });

      // Subscribe to call requests
      connector.on("call_request", async (error, payload) => {
        if (error) {
          throw error;
        }
        console.log("call_request", payload);

        // Handle Call Request

        /* payload:
        {
          id: 1,
          jsonrpc: '2.0'.
          method: 'eth_sign',
          params: [
            "0xbc28ea04101f03ea7a94c1379bc3ab32e65e62d3",
            "My email is john@doe.com - 1537836206101"
          ]
        }
        id: 1639703933151242
        jsonrpc: "2.0"
        method: "eth_sendTransaction"
        params: Array(1)
          data: "0x"
          from: "0xf1703c935c8d5fc95b8e3c7686fc87369351c3d1"
          gas: "0x5208"
          gasPrice: "0x11ed8ec200"
          nonce: "0x5d"
          to: "0xf1703c935c8d5fc95b8e3c7686fc87369351c3d1"
          value: "0x0"
        */
        const [txParams] = payload.params;
        const tx = Transaction.fromTxData(txParams);
        console.log("tx", tx);
        const hash = tx.getMessageToSign();
        const hashString = hash.toString("hex");
        onSignFormSubmit(hashString);
        const [{ signResult }] = (await once(
          workerEvents,
          "sign_result"
        )) as any;
        console.log("got WC sign result", signResult);
        const signedTx = Transaction.fromTxData({
          ...txParams,
          r: Buffer.from(signResult.r, "hex"),
          s: Buffer.from(signResult.s, "hex"),
          v: 27 + signResult.recid,
        });
        const txHash = signedTx.hash();
        // Approve Call Request
        connector.approveRequest({
          id: payload.id,
          result: `0x${txHash.toString("hex")}`,
        });
      });
    };

    const onSignFormSubmit = (message: string) => {
      worker.postMessage({ type: "sign_proposal", message });
      setSignFormVisible(false);
      setWcFormVisible(false);
    };

    const onSignMessage = (message: string) => {
      setSignStatusMessage("Waiting for sign threshold...");
      worker.postMessage({ type: "sign_message", message });
    };

    // Handle message from the worker
    worker.onmessage = (e) => {
      const { type } = e.data;
      workerEvents.emit(type, e.data);
      switch (type) {
        // Worker sends us the backend server URL
        case "connected":
          const { url } = e.data;
          setUrl(url);
          setConnected(true);
          break;
        case "disconnected":
          setConnected(false);
          break;
        // Worker has been initialized and is ready with the server parameters
        case "ready":
          const { conn_id, parties, threshold } = e.data;
          setClientId(conn_id);
          setParties(parties);
          setThreshold(threshold);
          setKeygenSignupVisible(true);
          break;
        case "party_signup":
          const { partySignup } = e.data;
          setPartyNumber(partySignup.number > 0 ? partySignup.number : "N/A");
          break;
        case "log":
          const { message: logMessage } = e.data;
          setLogMessage(logMessage);
          break;
        // We have all the key information for this party
        case "keygen_complete":
          setLogMessage("SIGN_MESSAGE_PROPOSAL");
          setSignFormVisible(true);
          setWcFormVisible(true);
          break;
        case "sign_progress":
          setSignStatusMessage("Signing in progress...");
          break;
        case "sign_proposal":
          setLogMessage("SIGN_PENDING");
          const { message } = e.data;
          // clean up
          setSignFormVisible(false);
          setWcFormVisible(false);
          setSignResult(null);
          setSignStatusMessage("");
          // show proposal
          setSignMessage(message);
          setSignProposalVisible(true);
          break;
        case "sign_result":
          setLogMessage("SIGN_RESULT");
          const { signResult } = e.data;
          setSignProposalVisible(false);
          setSignFormVisible(true);
          const msgHash = Buffer.from(signMessage, "hex");
          console.log("signMessage", signMessage);
          const publicKey = ecrecover(
            msgHash,
            27 + signResult.recid,
            Buffer.from(signResult.r, "hex"),
            Buffer.from(signResult.s, "hex")
          );
          const address = pubToAddress(publicKey);
          addressString = `0x${address.toString("hex")}`;
          signResult.address = addressString;
          setSignResult(signResult);
          setWcFormVisible(true);
          break;
      }
    };

    const Connected = () => (
      <>
        <p>Server: {url}</p>
        <p>Client ID: {clientId}</p>
        <p>Parties: {parties}</p>
        <p>Threshold: {threshold}</p>
        <p>Party #: {partyNumber ? partyNumber : "-"}</p>
        <p>State: {logMessage}</p>
        {keygenSignupVisible ? (
          <button onClick={onKeygenPartySignup}>Keygen Signup</button>
        ) : null}
        {signFormVisible ? <SignForm onSubmit={onSignFormSubmit} /> : null}
        {!wcConnected && wcFormVisible ? (
          <WalletConnectForm onSubmit={onWalletConnectFormSubmit} />
        ) : null}
        {signProposalVisible ? (
          <SignProposal
            signMessage={signMessage}
            signStatusMessage={signStatusMessage}
            onSignMessage={onSignMessage}
          />
        ) : null}
        {signResult ? (
          <pre>{JSON.stringify(signResult, undefined, 2)}</pre>
        ) : null}
      </>
    );

    return (
      <>
        <h1>ECDSA WASM Demo</h1>
        <p>Using the gg18 protocol, signing initiated on (threshold + 1)</p>
        <hr />
        <p>State: {logMessage}</p>
        {connected ? <Connected /> : <p>Not connected</p>}
      </>
    );
  } else {
    return <p>Your browser does not support web workers.</p>;
  }
};

const worker = window.Worker
  ? new Worker(new URL("./worker.ts", import.meta.url))
  : null;
ReactDOM.render(
  <React.StrictMode>
    <App worker={worker} />
  </React.StrictMode>,
  document.querySelector("main")
);
