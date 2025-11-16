import { createReducer, Action, on } from "@ngrx/store";
import * as fromActions from "state-management/actions/depositor.actions";
import {
  OneDepState,
  initialOneDepState,
  UploadStatus,
} from "state-management/state/depositor.store";

export const oneDepReducer = (
  state: OneDepState | undefined,
  action: Action,
) => {
  if (action.type.indexOf("[OneDep]") !== -1) {
    console.log("Action came in! " + action.type);
  }
  return reducer(state, action);
};

const reducer = createReducer(
  initialOneDepState,
  on(
    fromActions.submitDeposition,
    (state): OneDepState => ({
      ...state,
      depositionStatus: UploadStatus.Pending,
      fileUploadProgress: [],
    }),
  ),
  on(
    fromActions.startDepositionCreation,
    (state): OneDepState => ({
      ...state,
      depositionStatus: UploadStatus.InProgress,
    }),
  ),
  on(
    fromActions.submitDepositionSuccess,
    (state, { deposition }): OneDepState => ({
      ...state,
      depositionCreated: deposition,
      depositionStatus: UploadStatus.Success,
    }),
  ),
  on(
    fromActions.submitDepositionFailure,
    (state, { err }): OneDepState => ({
      ...state,
      oneDepInteractionError: err,
      depositionStatus: UploadStatus.Error,
    }),
  ),
  on(
    fromActions.updateFileUploadStatus,
    (state, { fileName, fileType, status, error }): OneDepState => {
      const existingIndex = state.fileUploadProgress.findIndex(
        (f) => f.fileName === fileName && f.fileType === fileType
      );

      let updatedProgress = [...state.fileUploadProgress];

      if (existingIndex >= 0) {
        // Update existing file progress
        updatedProgress[existingIndex] = {
          ...updatedProgress[existingIndex],
          status: status as UploadStatus,
          error,
        };
      } else {
        // Add new file progress
        updatedProgress.push({
          fileName,
          fileType,
          status: status as UploadStatus,
          error,
        });
      }

      return {
        ...state,
        fileUploadProgress: updatedProgress,
      };
    },
  ),
  on(
    fromActions.resetUploadProgress,
    (state): OneDepState => ({
      ...state,
      depositionStatus: UploadStatus.Pending,
      fileUploadProgress: [],
      depositionCreated: undefined,
      oneDepInteractionError: undefined,
    }),
  ),
);
