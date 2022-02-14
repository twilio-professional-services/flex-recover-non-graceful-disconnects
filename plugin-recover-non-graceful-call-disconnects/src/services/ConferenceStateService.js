import { utils } from "../utils";

/**
 * Perform API call to backend state management (e.g. Twilio Sync or custom backend) to facilitate
 * sharing of conference/task details without needing to make frequent Twilio REST API calls.
 */
class ConferenceStateService {
  /**
   * Adds the initial state of the conference
   */
  static addWorker = async (
    conferenceSid,
    taskSid,
    taskAttributes,
    taskWorkflowSid,
    customerCallSid,

    workerSid,
    workerCallSid,
    workerName
  ) => {
    console.debug(`ConferenceStateService.addWorker conferenceSid: ${conferenceSid} workerSid: ${workerSid}`);

    const fetchUrl = `${utils.baseServerlessUrl}/flex/add-worker-to-conference-state`;
    const fetchBody = {
      Token: utils.userToken,
      conferenceSid,
      taskSid,
      taskAttributes: JSON.stringify(taskAttributes),
      taskWorkflowSid,
      customerCallSid,
      workerSid,
      workerCallSid,
      workerName
    };

    const fetchOptions = utils.fetchPostUrlEncoded(fetchBody);
    const fetchResponse = await fetch(fetchUrl, fetchOptions);
    const fetchResult = await fetchResponse.json();
    console.debug("ConferenceStateService.addWorker result", fetchResult);
    return fetchResult;
  };

  /**
   * Updates the state of the conference to reflect graceful agent termination
   *
   * @param conferenceSid
   *
   */
  static removeWorker = async (conferenceSid, workerSid) => {
    console.debug(`ConferenceStateService.removeWorker conferenceSid: ${conferenceSid} workerSid: ${workerSid}`);

    const fetchUrl = `${utils.baseServerlessUrl}/flex/remove-worker-from-conference-state`;
    const fetchBody = {
      Token: utils.userToken,
      conferenceSid,
      workerSid,
    };

    const fetchOptions = utils.fetchPostUrlEncoded(fetchBody);
    const fetchResponse = await fetch(fetchUrl, fetchOptions);
    const fetchResult = await fetchResponse.json();
    console.debug("ConferenceStateService.removeWorker", fetchResult);
    return fetchResult;
  };

}

export default ConferenceStateService;
