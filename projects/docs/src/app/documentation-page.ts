import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { ActivatedRoute } from '@angular/router';

import type { DocumentationPage } from './documentation';

@Component({
  selector: 'app-documentation-page',
  imports: [MatCardModule],
  templateUrl: './documentation-page.html',
  styleUrl: './documentation-page.css',
})
export class DocumentationPageComponent {
  protected readonly page = inject(ActivatedRoute).snapshot.data['page'] as DocumentationPage;
}
