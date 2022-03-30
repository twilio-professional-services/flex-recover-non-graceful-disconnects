const createTask = async (
  workspaceSid,
  workflowSid,
  attributes,
  timeout,
  priority
) => {
  const task = await twilioClient.taskrouter
    .workspaces(workspaceSid)
    .tasks.create({
      workflowSid,
      attributes: JSON.stringify(attributes),
      timeout,
      priority,
    });
  console.debug(`Created task ${task.sid}`);
};

const getTask = async (workspaceSid, taskSid) => {
  console.debug(`Fetching ${taskSid} from Taskrouter`);
  try {
    const task = await twilioClient.taskrouter
      .workspaces(workspaceSid)
      .tasks(taskSid)
      .fetch();
    return task;
  } catch (error) {
    console.debug(`Unable to find ${taskSid}`);
    return undefined;
  }
};

const updateTask = async (workspaceSid, taskSid, payload) => {
  console.debug(
    `Updating task ${taskSid} with payload ${JSON.stringify(payload)}`
  );

  try {
    const task = await twilioClient.taskrouter
      .workspaces(workspaceSid)
      .tasks(taskSid)
      .update(payload);
    console.debug(
      `Updated task ${taskSid} successfully`
    );
    return task;
  } catch (error) {
    console.debug(`Error updating task ${taskSid}`, error);
    return undefined;
  }

};

const getReservation = async (workspaceSid, taskSid, reservationSid) => {
  console.debug(`Fetching ${reservationSid} from Taskrouter`);
  try {
    const reservation = await twilioClient.taskrouter
      .workspaces(workspaceSid)
      .tasks(taskSid)
      .reservations(reservationSid)
      .fetch();
    return reservation;
  } catch (error) {
    console.debug(`Unable to find ${reservationSid}`);
    return undefined;
  }
};

const updateReservation = async (workspaceSid, taskSid, reservationSid, payload) => {
  console.debug(
    `Updating task ${reservationSid} with payload ${JSON.stringify(payload)}`
  );

  try {
    const reservation = await twilioClient.taskrouter
      .workspaces(workspaceSid)
      .tasks(taskSid)
      .reservations(reservationSid)
      .update(payload);
    console.debug(
      `Updated reservation ${reservationSid} successfully`
    );
    return reservation;
  } catch (error) {
    console.debug(`Error updating reservation ${reservationSid}`, error);
    return undefined;
  }

};

module.exports = {
  createTask,
  getTask,
  updateTask,
  getReservation,
  updateReservation
};
