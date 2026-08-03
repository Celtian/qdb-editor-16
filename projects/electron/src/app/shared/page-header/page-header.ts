import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-page-header',
  imports: [MatIconModule],
  templateUrl: './page-header-inline-1.html',
  styleUrl: './page-header.css',
})
export class PageHeader {
  readonly icon = input('');
}
