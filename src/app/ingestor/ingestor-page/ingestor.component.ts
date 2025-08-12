import { Component, OnInit } from "@angular/core";
import { AppConfigService } from "app-config.service";
import { IngestorMode } from "./helper/ingestor.component-helper";

@Component({
  selector: "ingestor",
  styleUrls: ["./ingestor.component.scss"],
  template: `
    <div>
      <ingestor-transfer *ngIf="ingestorMode === 'transfer'" />
      <ingestor-creation *ngIf="ingestorMode === 'creation'" />
    </div>
  `,
  standalone: false,
})
export class IngestorComponent implements OnInit {
  appConfig = this.appConfigService.getConfig();
  ingestorMode: IngestorMode = "default";

  constructor(public appConfigService: AppConfigService) {}

  ngOnInit() {
    if (this.appConfig.addDatasetEnabled) {
      this.ingestorMode = "creation"; 
    }
  }
}
