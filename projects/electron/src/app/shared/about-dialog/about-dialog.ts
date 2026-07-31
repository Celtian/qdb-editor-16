import { NgOptimizedImage } from '@angular/common';
import { Component, Service, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { VERSION_INFO } from '../../../../../version-info';

@Component({
  selector: 'app-about-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule, NgOptimizedImage],
  templateUrl: './about-dialog.html',
  styleUrl: './about-dialog.css',
})
export class AboutDialog {
  protected readonly version = VERSION_INFO.version;
  protected readonly author = VERSION_INFO.author.name;
  protected readonly currentYear = new Date(VERSION_INFO.date).getUTCFullYear();
}

@Service()
export class AboutDialogService {
  private readonly dialog = inject(MatDialog);

  open(): void {
    this.dialog.open(AboutDialog, {
      ariaModal: true,
      autoFocus: '[aria-label="Close About dialog"]',
      delayFocusTrap: false,
      disableClose: false,
      maxWidth: 'calc(100vw - 2rem)',
      panelClass: 'about-dialog-panel',
      restoreFocus: true,
      width: '35rem',
    });
  }
}
