# GitHub Copilot Budget Simulator

GitHub Copilot Budget Simulator is a local React + TypeScript app for modeling Copilot-style budgets across an organization and its divisions.

It helps you:

- compare Standard and Advanced profile assumptions
- define division-level user totals and percentage splits
- calculate seat budget, shared-pool AI Credits, and overage impact
- enable a promotional period for selected profiles
- generate a printable report for sharing or review

## What it does

The app is organized around two planning layers:

- Organization assumptions: set company information, profile pricing, included credits, and promotional flags.
- Division plans: assign total users, split users by percentage, and review the resulting budget metrics.

The calculations live in `src/lib/budget.ts`, while the UI and printable report generation live in `src/App.tsx`.

## Features

- Editable company information and budget notes
- Standard and Advanced profile inputs by default
- Support for additional profiles
- Division-level user totals with percentage-based allocation
- Slider plus percentage input workflow for fast rebalancing
- Printable summary page with roll-up and pivot-style views
- Promotion support for the Jun-Aug 2026 window

## Getting Started

### Install dependencies

```bash
npm install
```

### Run the app locally

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

### Lint the code

```bash
npm run lint
```

## Deploy to GitHub Pages

The repository includes a GitHub Actions workflow at `.github/workflows/deploy.yml`.

It runs on pushes to `main` and manual dispatch, then:

1. installs dependencies with `npm ci`
2. builds the app with `npm run build`
3. uploads the `dist` output to GitHub Pages
4. deploys the site through the GitHub Pages deployment action

Make sure GitHub Pages is enabled for the repository and set to use GitHub Actions as the deployment source.

## Project Structure

- `src/App.tsx` - main UI, input handling, printable report
- `src/App.css` - app layout and component styling
- `src/lib/budget.ts` - budget and allocation calculations
- `src/main.tsx` - React entry point

## Notes

- The app runs entirely in the browser.
- Budget calculations are based on the current form state; there is no backend or database.
- The printable report is generated from the current page state and opened in a new window.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
