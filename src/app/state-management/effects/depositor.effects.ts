import { Injectable } from "@angular/core";
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { of, from } from "rxjs";
import { catchError, map, switchMap, concatMap, last, tap } from "rxjs/operators";
import { HttpErrorResponse } from "@angular/common/http";
import { Store } from "@ngrx/store";
import { MessageType } from "state-management/models";
import { showMessageAction } from "state-management/actions/user.actions";
import * as fromActions from "state-management/actions/depositor.actions";
import { Depositor } from "shared/sdk/apis/depositor.service";
import {
  OneDepUserInfo,
  OneDepCreated,
  UploadedFile,
  DepBackendVersion,
} from "shared/sdk/models/OneDep";
import { EmFile } from "../../datasets/depositor/onedep/types/methods.enum";
@Injectable()
export class OneDepEffects {
  connectToDepositor$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(fromActions.connectToDepositor),
      switchMap(() =>
        this.onedepDepositor.getVersion().pipe(
          map((res) =>
            fromActions.connectToDepositorSuccess({
              depositor: res as DepBackendVersion,
            }),
          ),
          catchError((err) =>
            of(fromActions.connectToDepositorFailure({ err })),
          ),
        ),
      ),
    );
  });

  connectToDepositorSuccess$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(fromActions.connectToDepositorSuccess),
      switchMap(({ depositor }) => {
        const message = {
          type: MessageType.Success,
          content:
            "Successfully connected to depositor version " + depositor.version,
          duration: 5000,
        };
        return of(showMessageAction({ message }));
      }),
    );
  });

  connectToDepositorFailure$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(fromActions.connectToDepositorFailure),
      switchMap(({ err }) => {
        const errorMessage =
          err instanceof HttpErrorResponse
            ? (err.error?.message ?? err.message ?? "Unknown error")
            : err.message || "Unknown error";
        const message = {
          type: MessageType.Error,
          content:
            "Failed to connect to the depositor service: " +
            errorMessage +
            " Are you sure service is running?",
          duration: 5000,
        };
        return of(showMessageAction({ message }));
      }),
    );
  });

  submitDeposition$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(fromActions.submitDeposition),
      tap(() => {
        // Dispatch action to show deposition creation is in progress
        this.store.dispatch(fromActions.startDepositionCreation());
      }),
      switchMap(({ deposition, files }) => {
        const jwtToken = deposition.jwtToken;
        return this.onedepDepositor.createDep(deposition).pipe(
          tap((dep) => {
            const message = {
              type: MessageType.Success,
              content: `Deposition entry created: ${dep.id}. Start uploading files.`,
              duration: 10000,
            };
            this.store.dispatch(showMessageAction({ message }));

            // Initialize file upload progress for each file
            files.forEach((file) => {
              const fileName = this.getFileNameFromFormData(file.form) || 'Unknown';
              this.store.dispatch(
                fromActions.updateFileUploadStatus({
                  fileName,
                  fileType: file.fileType,
                  status: 'pending',
                })
              );
            });
          }),
          switchMap((dep) =>
            from(files).pipe(
              concatMap((file) => {
                const fileName = this.getFileNameFromFormData(file.form) || 'Unknown';

                // Mark file as in progress
                this.store.dispatch(
                  fromActions.updateFileUploadStatus({
                    fileName,
                    fileType: file.fileType,
                    status: 'in_progress',
                  })
                );

                const uploadObservable =
                  file.fileType === EmFile.Coordinates
                    ? this.onedepDepositor.sendCoordFile(dep.id, file.form)
                    : file.fileType === EmFile.Metadata
                    ? this.onedepDepositor.sendMetadata(dep.id, file.form)
                    : this.onedepDepositor.sendFile(dep.id, file.form);

                return uploadObservable.pipe(
                  tap(() => {
                    // Mark file as success
                    this.store.dispatch(
                      fromActions.updateFileUploadStatus({
                        fileName,
                        fileType: file.fileType,
                        status: 'success',
                      })
                    );
                  }),
                  catchError((err) => {
                    // Mark file as error
                    this.store.dispatch(
                      fromActions.updateFileUploadStatus({
                        fileName,
                        fileType: file.fileType,
                        status: 'error',
                        error: err.message || 'Upload failed',
                      })
                    );
                    return of(null); // Continue with other files
                  })
                );
              }),

              last(),
              switchMap(() => {
                const processForm = new FormData();
                processForm.append('jwtToken', jwtToken);
                return this.onedepDepositor.process(dep.id, processForm).pipe(
                  tap(() => {
                    const message = {
                      type: MessageType.Success,
                      content: `Deposition ${dep.id} processed successfully.`,
                      duration: 5000,
                    };
                    this.store.dispatch(showMessageAction({ message }));
                  }),
                  map(() =>
                    fromActions.submitDepositionSuccess({
                      deposition: dep as OneDepCreated,
                    }),
                  ),
                  catchError((err) => {
                    const errorMessage =
                      err instanceof HttpErrorResponse
                        ? (err.error?.message ?? err.message ?? "Unknown error")
                        : err.message || "Unknown error";
                    const message = {
                      type: MessageType.Error,
                      content: `Failed to process deposition ${dep.id}: ${errorMessage}`,
                      duration: 10000,
                    };
                    this.store.dispatch(showMessageAction({ message }));
                    return of(fromActions.submitDepositionFailure({ err }));
                  })
                );
              }),
            ),
          ),
          catchError((err) => of(fromActions.submitDepositionFailure({ err }))),
        );
      }),
    );
  });

  private getFileNameFromFormData(formData: FormData): string | null {
    const file = formData.get('file') as File;
    if (file && file.name) {
      return file.name;
    }
    // For metadata-only uploads
    if (formData.has('scientificMetadata')) {
      return 'metadata.cif';
    }
    return null;
  }

  submitDepositionSuccess$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(fromActions.submitDepositionSuccess),
      switchMap(({ deposition }) => {
        const message = {
          type: MessageType.Success,
          content:
            "Deposition Created Successfully. Deposition ID: " + deposition.id,
          duration: 5000,
        };
        setTimeout(function () {
          window.open(
            `https://onedep-depui-test.wwpdb.org/deposition/api/v1/depositions/${deposition.id}/view`,
            "_blank",
          );
        }, 1800);
        return of(showMessageAction({ message }));
      }),
    );
  });

  submitDepositionFailure$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(fromActions.submitDepositionFailure),
      switchMap(({ err }) => {
        const errorMessage =
          err instanceof HttpErrorResponse
            ? (err.error?.message ?? err.message ?? "Unknown error")
            : err.message || "Unknown error";
        const message = {
          type: MessageType.Error,
          content: "Deposition to OneDep failed: " + errorMessage,
          duration: 10000,
        };
        return of(showMessageAction({ message }));
      }),
    );
  });

  accessEmpiarSchema$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(fromActions.accessEmpiarSchema),
      switchMap(() =>
        this.onedepDepositor.getEmpiarSchema().pipe(
          map((res) =>
            fromActions.accessEmpiarSchemaSuccess({
              schema: res.schema,
            }),
          ),
          catchError((err) =>
            of(fromActions.accessEmpiarSchemaFailure({ err })),
          ),
        ),
      ),
    );
  });

  accessEmpiarSchemaSuccess$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(fromActions.accessEmpiarSchemaSuccess),
      switchMap(() => {
        const message = {
          type: MessageType.Success,
          content: "Successfully retrieved EMPIAR schema ",
          duration: 5000,
        };
        return of(showMessageAction({ message }));
      }),
    );
  });

  accessEmpiarSchemaFailure$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(fromActions.accessEmpiarSchemaFailure),
      switchMap(({ err }) => {
        const errorMessage =
          err instanceof HttpErrorResponse
            ? (err.error?.message ?? err.message ?? "Unknown error")
            : err.message || "Unknown error";
        const message = {
          type: MessageType.Error,
          content: "Failed to retrieve EMPIAR schema: " + errorMessage,
          duration: 10000,
        };
        return of(showMessageAction({ message }));
      }),
    );
  });

  // createDeposition$ = createEffect(() => {
  //   return this.actions$.pipe(
  //     ofType(fromActions.createDepositionAction),
  //     switchMap(({ deposition }) =>
  //       this.onedepDepositor.createDep(deposition as OneDepUserInfo).pipe(
  //         map((res) =>
  //           fromActions.createDepositionSuccess({
  //             deposition: res as OneDepCreated,
  //           }),
  //         ),
  //         catchError((err) => of(fromActions.createDepositionFailure({ err }))),
  //       ),
  //     ),
  //   );
  // });

  // createDepositionSuccessMessage$ = createEffect(() => {
  //   return this.actions$.pipe(
  //     ofType(fromActions.createDepositionSuccess),
  //     switchMap(({ deposition }) => {
  //       const message = {
  //         type: MessageType.Success,
  //         content:
  //           "Deposition Created Successfully. Deposition ID: " +
  //           deposition.depID,
  //         duration: 5000,
  //       };
  //       return of(showMessageAction({ message }));
  //     }),
  //   );
  // });

  // createDepositionFailureMessage$ = createEffect(() => {
  //   return this.actions$.pipe(
  //     ofType(fromActions.createDepositionFailure),
  //     switchMap(({ err }) => {
  //       const errorMessage =
  //         err instanceof HttpErrorResponse
  //           ? (err.error?.message ?? err.message ?? "Unknown error")
  //           : err.message || "Unknown error";
  //       const message = {
  //         type: MessageType.Error,
  //         content: "Deposition to OneDep failed: " + errorMessage,
  //         duration: 10000,
  //       };
  //       return of(showMessageAction({ message }));
  //     }),
  //   );
  // });
  // uploadFiles$ = createEffect(() => {
  //   return this.actions$.pipe(
  //     ofType(fromActions.uploadFilesAction),
  //     mergeMap(({ depID, files }) =>
  //       from(files).pipe(
  //         mergeMap((file) =>
  //           this.onedepDepositor.sendFile(depID, file.form).pipe(
  //             map((res) =>
  //               fromActions.sendFileSuccess({
  //                 uploadedFile: res as UploadedFile,
  //               }),
  //             ),
  //             catchError((err) => of(fromActions.sendFileFailure({ err }))),
  //           ),
  //         ),
  //       ),
  //     ),
  //   );
  // });
  // sendFile$ = createEffect(() => {
  //   return this.actions$.pipe(
  //     ofType(fromActions.sendFile),
  //     switchMap(({ depID, form }) =>
  //       this.onedepDepositor.sendFile(depID, form).pipe(
  //         map((res) =>
  //           fromActions.sendFileSuccess({
  //             uploadedFile: res as UploadedFile,
  //           }),
  //         ),
  //         catchError((err) => of(fromActions.sendFileFailure({ err }))),
  //       ),
  //     ),
  //   );
  // });

  // sendFileSuccessMessage$ = createEffect(() => {
  //   return this.actions$.pipe(
  //     ofType(fromActions.sendFileSuccess),
  //     switchMap(({ uploadedFile }) => {
  //       const message = {
  //         type: MessageType.Success,
  //         content:
  //           "File Upladed to Deposition ID: " +
  //           uploadedFile.depID +
  //           " with File ID: " +
  //           uploadedFile.fileID,
  //         duration: 5000,
  //       };
  //       return of(showMessageAction({ message }));
  //     }),
  //   );
  // });

  // sendFileFailureMessage$ = createEffect(() => {
  //   return this.actions$.pipe(
  //     ofType(fromActions.sendFileFailure),
  //     switchMap(({ err }) => {
  //       const errorMessage =
  //         err instanceof HttpErrorResponse
  //           ? (err.error?.message ?? err.message ?? "Unknown error")
  //           : err.message || "Unknown error";
  //       const message = {
  //         type: MessageType.Error,
  //         content: "Deposition to OneDep failed: " + errorMessage,
  //         duration: 10000,
  //       };
  //       return of(showMessageAction({ message }));
  //     }),
  //   );
  // });

  // sendCoordFile$ = createEffect(() =>
  //   this.actions$.pipe(
  //     ofType(OneDepActions.sendCoordFile),
  //     mergeMap((action) =>
  //       this.http
  //         .post(
  //           `${this.connectedDepositionBackend}onedep/${action.depID}/pdb`,
  //           action.form
  //         )
  //         .pipe(
  //           map((res) =>
  //             OneDepActions.sendCoordFileSuccess({ res })
  //           ),
  //           catchError((error) =>
  //             of(OneDepActions.sendCoordFileFailure({ error }))
  //           )
  //         )
  //     )
  //   )
  // );

  // sendMetadata$ = createEffect(() =>
  //   this.actions$.pipe(
  //     ofType(OneDepActions.sendMetadata),
  //     mergeMap((action) =>
  //       this.http
  //         .post(
  //           `${this.connectedDepositionBackend}onedep/${action.depID}/metadata`,
  //           action.form
  //         )
  //         .pipe(
  //           map((res) =>
  //             OneDepActions.sendMetadataSuccess({ res })
  //           ),
  //           catchError((error) =>
  //             of(OneDepActions.sendMetadataFailure({ error }))
  //           )
  //         )
  //     )
  //   )
  // );
  constructor(
    private actions$: Actions,
    private onedepDepositor: Depositor,
    private store: Store,
  ) {}
}