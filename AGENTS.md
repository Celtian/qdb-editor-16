You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Prefer inline templates for small components
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
- When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Styling

- Use Tailwind CSS v4 utilities directly in Angular templates for ordinary presentation styling
- Use `@import 'tailwindcss'`; do not add Tailwind v3 directives or a `tailwind.config.js` file
- Use standard Tailwind utilities whenever possible. Add reusable named values to the shared `tailwind.theme-*.css` theme files when the standard scale does not represent a required design token
- Do NOT use arbitrary-value Tailwind classes, custom `@utility` declarations, presentation-only custom classes, `data-ui-*` styling hooks, ESLint class whitelists, or concatenated class-name fragments
- For conditional styling, bind complete Tailwind utility names with `[class.utility]` or return complete, statically discoverable class strings from typed lookup tables
- Put descendant styling on owned child elements instead of styling them through a parent selector
- Keep semantic `data-*` attributes only when they represent application state or identity, or when they are required to coordinate runtime-generated or third-party descendants that Tailwind variants cannot address cleanly. Never add them solely for tests or ordinary presentation
- Keep component CSS focused on component hosts, Angular Material/CDK internals and overlay contracts, animations and reduced-motion rules, pseudo-elements or complex selectors, runtime coordinate styles, and complex graphics such as the offline map
- Remove empty stylesheets and obsolete `styleUrl` declarations
- Keep Tailwind classes ordered by the configured formatter and ensure `tailwindcss/no-arbitrary-value` and `tailwindcss/no-custom-classname` continue to pass without exceptions

## Styling Tests

- Prefer Angular Material/CDK harnesses, roles, accessible names, semantic application state, and rendered behavior over presentation selectors
- Do not assert removed custom class names or introduce test-only styling hooks

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection
