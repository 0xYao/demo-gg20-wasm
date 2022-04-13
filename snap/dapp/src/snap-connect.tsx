import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Stack,
  Button,
  Link,
  Typography,
  Snackbar,
  Alert,
} from "@mui/material";

import snapId from "./snap-id";

type RedirectHandler = () => void;

type SnapConnectProps = {
  redirect: string | RedirectHandler;
};

export default function SnapConnect(props: SnapConnectProps) {
  const { redirect } = props;
  const navigate = useNavigate();
  const [[showError, connectError], setConnectError] = useState([false, null]);

  async function onConnect() {
    try {
      await ethereum.request({
        method: "wallet_enable",
        params: [
          {
            wallet_snap: { [snapId]: {} },
          },
        ],
      });

      if (typeof redirect === "string") {
        navigate(redirect);
      } else {
        redirect();
      }

      /*
      await dispatch(clearState());

      const {payload: keyShares} = await dispatch(loadState());
      console.log("Got key shares", keyShares);
      */

      /*
      keyShares.push({label: 'Mock Key Share'});
      console.log("After append", keyShares);

      // Update with amended state
      await dispatch(saveState(keyShares));
      */

      /*
      // Check the new state is good
      const {payload: newKeyShares} = await dispatch(loadState());
      console.log("After saveState", newKeyShares);
      */
    } catch (e) {
      setConnectError([true, e]);
    }
  }

  const handleClose = (
    event?: React.SyntheticEvent | Event,
    reason?: string
  ) => {
    if (reason === "clickaway") {
      return;
    }
    setConnectError([false, null]);
  };

  return (
    <>
      <Stack spacing={2}>
        <Typography variant="body1" component="div" gutterBottom>
          To begin you should have installed{" "}
          <Link href="https://metamask.io/flask/">MetaMask Flask</Link> and then
          you can connect.
        </Typography>
        <Button variant="contained" onClick={onConnect}>
          Connect to MetaMask
        </Button>
      </Stack>

      <Snackbar open={showError} autoHideDuration={6000} onClose={handleClose}>
        <Alert onClose={handleClose} severity="error">
          Could not connect: {connectError ? connectError.message : ""}
        </Alert>
      </Snackbar>
    </>
  );
}
