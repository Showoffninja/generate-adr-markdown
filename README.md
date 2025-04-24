# Generate ADR Markdown GitHub Action

This GitHub Action converts issues with a specific label into Architectural Decision Records (ADR) markdown files upon issue closure. The ADR files are organized into sub-folders based on their status (`proposed`, `accepted`, `rejected`).

## Features

- Automatically generates ADR markdown files from issues.
- Supports sub-folder organization for ADR status (`proposed`, `accepted`, `rejected`).
- Ensures unique, sequential numbering for filenames (e.g., `0001-title.md`).

## Inputs

### `label_name` (required)
The label that identifies issues to be converted into ADRs.

### `destination_folder` (required)
The folder where ADR markdown files will be stored. Defaults to `adr-files`.

### `adr_status` (optional)
The status of the ADR. Must be one of `proposed`, `accepted`, or `rejected`. Defaults to `proposed`.

## Outputs
None.

## Example Usage

### Workflow File

```yaml
name: Generate ADR Markdown

on:
  issues:
    types:
      - closed

jobs:
  generate-adr:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Generate ADR Markdown
        uses: ./ # Local action in the repository
        with:
          label_name: "ADR"
          destination_folder: "adr-files"
          adr_status: "proposed"
```

## Getting Started

1. Clone this repository and add the code to your GitHub repository under `.github/actions/adr-action`.
2. Define a workflow file (e.g., `.github/workflows/generate-adr.yml`) using the example above.
3. Create an issue using the ADR Issue Form and close it.
4. The ADR markdown file will be generated in the `adr-files/<status>` folder and committed to the repository.

## Folder Structure

The ADR files are organized as follows:

```
adr-files/
├── accepted/
│   ├── 0001-adopt-graphql.md
├── proposed/
│   ├── 0002-use-docker-containers.md
├── rejected/
```

## License
This project is licensed under the MIT License.
