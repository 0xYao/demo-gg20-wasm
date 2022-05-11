import React from "react";
import { useSelector, useDispatch } from "react-redux";

import { Alert, Button, Stack, Typography } from "@mui/material";

import { sessionSelector } from "../../store/session";
import { saveMessageProof } from "../../store/proofs";
import PublicAddress from "../../components/public-address";
import { encode, download, toHexString } from "../../utils";

export default function SaveProof() {
  const dispatch = useDispatch();
  const { group, signCandidate, signProof } = useSelector(sessionSelector);
  const { address, creator, signingType } = signCandidate;
  const { label } = group;

  const saveProof = () => {
    console.log("TODO: save proof", address, signProof);
    dispatch(saveMessageProof([address, signProof]));
  };

  const downloadProof = () => {
    const dt = new Date();
    dt.setTime(signProof.timestamp);
    const fileName = `${address}-${toHexString(
      signProof.value.digest
    )}-${dt.toISOString()}.json`;
    const buffer = encode(JSON.stringify(signProof, undefined, 2));
    download(fileName, buffer);
  };

  const heading = creator ? null : (
    <Stack>
      <Typography variant="h4" component="div">
        {label}
      </Typography>
      <Stack direction="row" alignItems="center">
        <PublicAddress address={address} />
      </Stack>
    </Stack>
  );

  return (
    <Stack padding={1} spacing={2} marginTop={2}>
      {heading}
      <Alert severity="success">The {signingType} was signed!</Alert>
      <Stack direction="row" spacing={2}>
        <Button variant="contained" onClick={downloadProof}>
          Download
        </Button>
        <Button variant="contained" onClick={saveProof}>
          Save Proof
        </Button>
      </Stack>
    </Stack>
  );
}
