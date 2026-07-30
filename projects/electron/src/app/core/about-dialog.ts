import { NgOptimizedImage } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { VERSION_INFO } from '../../../../version-info';

@Component({
  selector: 'app-about-dialog',
  imports: [NgOptimizedImage, MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './about-dialog.html',
  styleUrl: './about-dialog.css',
})
export class AboutDialog {
  protected readonly version = VERSION_INFO.version;
  protected readonly author = VERSION_INFO.author.name;
  protected readonly copyrightYear = new Date(VERSION_INFO.date).getUTCFullYear();
  protected readonly documentationUrl = 'https://celtian.github.io/qdb-editor-16/';
  protected readonly repositoryUrl = 'https://github.com/Celtian/qdb-editor-16';
}
