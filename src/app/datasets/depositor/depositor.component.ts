import { Component, OnInit, OnDestroy, ChangeDetectorRef } from "@angular/core";
import {
  FormControl,
  FormGroup,
  FormBuilder,
  Validators,
} from "@angular/forms";
import { AppConfigService, AppConfigInterface } from "app-config.service";
import { JsonSchema } from "@jsonforms/core";
import { Store } from "@ngrx/store";
import {
  OutputDatasetObsoleteDto,
  ReturnedUserDto,
} from "@scicatproject/scicat-sdk-ts-angular";
import { selectCurrentDataset } from "state-management/selectors/datasets.selectors";
// import {
//   selectIsAdmin,
//   selectIsLoading,
//   selectIsLoggedIn,
//   selectProfile,
// } from "state-management/selectors/user.selectors";
import { selectCurrentUser } from "state-management/selectors/user.selectors";
import * as fromActions from "state-management/actions/depositor.actions";
import { accessEmpiarSchema } from "state-management/actions/depositor.actions";
import { selectEmpiarSchema } from "state-management/selectors/depositor.selectors";

import { updatePropertyAction } from "state-management/actions/datasets.actions";

import { IngestorMetadataEditorHelper } from "../../ingestor/ingestor-metadata-editor/ingestor-metadata-editor-helper";
import { EmFile } from "./onedep/types/methods.enum";
import { Subscription } from "rxjs";
import { Depositor } from "../../shared/sdk/apis/depositor.service";

interface DepositionRepository {
  value: string;
  viewValue: string;
}

@Component({
  selector: "depositor",
  templateUrl: "./depositor.component.html",
  styleUrls: ["./depositor.component.scss"],
  standalone: false,
})
export class DepositorComponent implements OnInit, OnDestroy {
  private subscriptions: Subscription[] = [];
  form: FormGroup;

  config: AppConfigInterface;
  supportedDepositionList: DepositionRepository[] = [
    { value: "onedep", viewValue: "OneDep" },
    { value: "empiar", viewValue: "EMPIAR" },
  ];
  depositionRepository: FormControl;
  dataset: OutputDatasetObsoleteDto | undefined;
  user: ReturnedUserDto | undefined;

  
  selectedMethod: string | null = null;
  onedepLink: {
    location: string;
    enabled: boolean;
  } | null = null;

  empiarSchemaEncoded:string | undefined;
  showMetadataEditor = false;

  metadata: any = {};
  metadataSchema: JsonSchema = null

  // Metadata validation properties
  isMetadataOk = false;
  metadataErrors = "";
  activeRenderView: string = "all"; // Can be "all" or "requiredOnly"

  // OneDep deposition properties
  depID: string | null = null;
  jwtToken: string = "";


  constructor(
    public appConfigService: AppConfigService,
    private store: Store,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private depositor: Depositor,
  ) {
    this.config = this.appConfigService.getConfig();
    this.depositionRepository = new FormControl("");
    this.form = this.fb.group({
      datasetName: new FormControl("", [Validators.required]),
      description: new FormControl("", [Validators.required]),
      keywords: this.fb.array([]),
    });
  }
  ngOnInit() {
    this.store.dispatch(fromActions.connectToDepositor());

    this.store.select(selectCurrentDataset).subscribe((dataset) => {
      this.dataset = dataset;
    });
    this.subscriptions.push(
      this.store.select(selectCurrentUser).subscribe((user) => {
        if (user) {
          this.user = user;
        }
      }),
    );
    this.store.select(selectCurrentDataset).subscribe((dataset) => {
      this.dataset = dataset;
      if (dataset) {
        this.metadata = this.dataset.scientificMetadata;
      }
        // this.metadataSchema = this.dataset.scientificMetadataSchema?||null;
    });

    this.store.dispatch(accessEmpiarSchema());
    this.subscriptions.push(
      this.store.select(selectEmpiarSchema).subscribe((schema) => {
        this.empiarSchemaEncoded = schema;
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach((subscription) => {
      subscription.unsubscribe();
    });
  }

  onChooseRepo() {
    this.selectedMethod = this.depositionRepository.value;
  }
 /**
  * Recursively removes all keys starting with '$' from an object
  * @param obj - The object to clean
  * @returns The cleaned object
  */
 private removeDollarProperties(obj: any): any {
   if (!obj || typeof obj !== "object") {
     return obj;
   }

   if (Array.isArray(obj)) {
     return obj.map(item => this.removeDollarProperties(item));
   }

   const cleaned: any = {};
   for (const key of Object.keys(obj)) {
     if (!key.startsWith("$")) {
       cleaned[key] = this.removeDollarProperties(obj[key]);
     }
   }
   return cleaned;
 }

 async onChangeScientificMetadata() {
  const selectedMethod = "https://raw.githubusercontent.com/osc-em/OSCEM_Schemas/refs/heads/main/project/spa/jsonschema/oscem_schemas_spa.schema.json";

  try {
    // Fetch the JSON file
    const response = await fetch(selectedMethod);
    const parsedSchema: JsonSchema = await response.json();

    // First, resolve all $refs in the schema
    const resolvedSchema = IngestorMetadataEditorHelper.resolveRefs(
      parsedSchema,
      parsedSchema
    );

    // Then remove all keys which start with $ at any level. Json Forms can't handle this. When preparing $refs are already resolved.
    const cleanedSchema = this.removeDollarProperties(resolvedSchema);

    this.metadataSchema = cleanedSchema;
    console.log(this.metadataSchema)
    // now it uses metadata structure in place of schema
    this.showMetadataEditor = true;
  } catch (error) {
    console.error('Failed to load schema:', error);
    // Handle error appropriately
  }
}
  onMetadataChange(newData: any) {
    this.metadata = newData;
  }

  onMetadataErrors(errors: any[]) {
    console.warn('Metadata validation errors:', errors);

    const result = IngestorMetadataEditorHelper.processMetadataErrors(
      errors,
      this.metadataSchema,
      this.activeRenderView,
    );

    this.isMetadataOk = result.isValid;
    this.metadataErrors = result.errorString;
    this.cdr.detectChanges();
  }


  onUpdateIngestorMetadata() {
    const pid = this.dataset.pid;
    const property = { scientificMetadata: this.metadata };
    this.store.dispatch(updatePropertyAction({ pid, property }));

    this.showMetadataEditor = false // hide again after the form was submitted
  }

  /**
   * Toggle render view between showing all fields or only required fields
   * @param viewMode - "all" to show all fields, "requiredOnly" to show only required fields
   */
  setRenderView(viewMode: "all" | "requiredOnly") {
    this.activeRenderView = viewMode;
    // Re-validate errors with new render view
    if (this.metadataErrors) {
      this.cdr.detectChanges();
    }
  }

  /**
   * Send metadata to OneDep deposition
   * Similar to the pattern in onedep.component.ts lines 664-673
   * Creates FormData with jwtToken and scientificMetadata (no file needed)
   */
  sendMetadataToOneDep(depID: string, jwtToken: string) {
    if (!this.metadata || Object.keys(this.metadata).length === 0) {
      console.error('No metadata to send');
      return;
    }

    // Create FormData similar to onedep component pattern
    const formDataFile = new FormData();
    formDataFile.append("jwtToken", jwtToken);
    formDataFile.append(
      "scientificMetadata",
      JSON.stringify(this.metadata),
    );

    // Use the depositor service to send metadata
    // This will call the /onedep/{depID}/metadata endpoint
    this.depositor.sendMetadata(depID, formDataFile).subscribe({
      next: (response) => {
        console.log('Metadata sent successfully:', response);
        // You can dispatch a success action or show a message here
      },
      error: (err) => {
        console.error('Failed to send metadata:', err);
        // You can dispatch a failure action or show an error message here
      }
    });
  }

  /**
   * Alternative: Use the NgRx pattern to send metadata
   * This dispatches an action that will be handled by the effects
   * Note: This will create a new deposition entry via submitDeposition action
   */
  sendMetadataViaStore(jwtToken: string) {
    if (!this.metadata || Object.keys(this.metadata).length === 0) {
      console.error('No metadata to send');
      return;
    }

    const formDataFile = new FormData();
    formDataFile.append("jwtToken", jwtToken);
    formDataFile.append(
      "scientificMetadata",
      JSON.stringify(this.metadata),
    );

    // Use the submitDeposition action with only metadata file
    this.store.dispatch(
      fromActions.submitDeposition({
        deposition: {
          email: this.user?.email || '',
          orcidIds: [],
          country: '',
          method: '',
          jwtToken: jwtToken,
        },
        files: [{ form: formDataFile, fileType: EmFile.Metadata }],
      }),
    );
  }

}