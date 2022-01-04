import React, { useState, useEffect, useContext } from "react";
import { useSelector, useDispatch } from "react-redux";
import { groupSelector } from "../store/group";
import { useNavigate } from "react-router-dom";
import { Parameters } from "../state-machine";
import { WebSocketContext } from "../websocket";
import { setGroup } from "../store/group";

interface CreateGroupProps {
  onSubmit: (data: GroupFormData) => void;
}

interface GroupFormData {
  label: string;
  params: Parameters;
}

const CreateGroup = (props: CreateGroupProps) => {
  const [label, setLabel] = useState("");

  const onLabelChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();
    setLabel(event.currentTarget.value);
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // TODO: get parties / threshold from form fields
    props.onSubmit({ label, params: { parties: 3, threshold: 1 } });
  };

  return (
    <>
      <h3>Create Group</h3>
      <p>To get started create a group for key generation and signing</p>
      <form onSubmit={onSubmit}>
        <input
          placeholder="Enter a group label"
          type="text"
          onChange={onLabelChange}
          value={label}
        />
        <input type="submit" value="Create Group" />
      </form>
    </>
  );
};

interface HomeProps {}

export default (props: HomeProps) => {
  const navigate = useNavigate();
  const { group } = useSelector(groupSelector);
  const dispatch = useDispatch();
  const websocket = useContext(WebSocketContext);

  const onCreateGroupSubmit = async (groupData: GroupFormData) => {
    const uuid = await websocket.rpc({
      method: "group_create",
      params: [groupData],
    });

    const group = { ...groupData, uuid };
    dispatch(setGroup(group));
  };

  useEffect(() => {
    if (group) {
      navigate(`/group/${group.uuid}`);
    }
  }, [group]);

  if (group) {
    return null;
  }

  return <CreateGroup onSubmit={onCreateGroupSubmit} />;
};
