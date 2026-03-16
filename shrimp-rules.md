# Development Guidelines

## Scope

- Treat this repository as a Python crawler plus static dashboard project.
- Re-scan the repository root recursively before every implementation task.
- Preserve the separation between crawler code under `app/` and publishable assets under `dashboard/`.

## Repository State

### Current Facts

- `app/` contains the Python package entrypoint, CLI, shared models, and output path contract.
- `app/adapters/` contains site-specific parsers and each site module must self-register via `register_adapter(...)`.
- `app/output/dashboard_data.py` builds `dashboard/data/latest.json` and, on full publish, also emits `dashboard/data/index.json` plus `dashboard/data/snapshots/<run_id>.json` for snapshot selection.
- `config/source_registry.yml` is the single source of truth for site and country target URLs.
- `config/source_registry.yml` may contain the same `country_code` more than once for one site when roaming/local 상품이 별도 URL인 경우다.
- `dashboard/` is reserved for GitHub Pages static assets.
- `tests/` is reserved for fixtures and regression tests.
- `data/` is the runtime output root and must not be hardcoded elsewhere with a different layout.
- `.github/workflows/collect-and-deploy.yml` is the deployment workflow and depends on the crawl CLI, tests, and dashboard outputs.

### Required First Action For Any New Task

- Inspect the full repository tree before writing code.
- Check whether the task changes the canonical schema, registry contract, or output contract.
- Update this file immediately after those conventions change.

## File Creation Rules

### Source Layout

- Put crawler runtime code under `app/`.
- Put site-specific scraping logic only under `app/adapters/`.
- Put orchestration and normalization stages under `app/pipeline/`.
- Put output path and serialization helpers under `app/output/`.
- Put reusable low-level helpers under `app/utils/`.
- Put static site assets only under `dashboard/`.
- Put target URL declarations only under `config/source_registry.yml`.
- Put adapter fixtures only under `tests/fixtures/`.
- Put workflow-facing smoke or regression checks only under `tests/`.

### Examples

- Do: add a new site parser as `app/adapters/<site>.py`.
- Do: make each new adapter module register itself when imported.
- Do: add schema-affecting field changes in `app/models.py` first.
- Do: keep new target URLs in `config/source_registry.yml`.
- Do: keep dashboard-facing aggregate changes and snapshot publish manifests in `app/output/dashboard_data.py`.
- Do not: spread source URLs across adapter files, tests, and docs as separate sources of truth.
- Do not: let `dashboard/` read raw crawler internals directly.

## Multi-File Coordination

### Current Rule

- When `app/models.py` changes, update `README.md` and any affected dashboard data contract in the same change.
- When `config/source_registry.yml` changes, update or add the matching adapter tests in `tests/`.
- When output layout in `app/output/paths.py` changes, update `README.md`, dashboard data readers, and workflow definitions together.
- When `app/output/dashboard_data.py` changes, update `dashboard/app.js` and dashboard verification steps together.
- When `.github/workflows/collect-and-deploy.yml` changes, verify referenced files and commands still exist.

### When New Files Appear

- If a new workflow is added under `.github/workflows/`, record the crawler and dashboard files it depends on.
- If a new schema or config file is introduced, declare whether it replaces or supplements `config/source_registry.yml`.

## Modification Rules

### Before Editing

- Verify the target file exists in the repository.
- Check whether the change touches registry, schema, output layout, or dashboard consumption.
- Modify only the files proven to be relevant by that contract.

### After Editing

- Re-check whether the change introduced a new permanent convention.
- Update `shrimp-rules.md` when the answer is yes.
- Keep `README.md` aligned with any new top-level workflow or contract.
- Run `python -m pytest -q` after changing adapters, schema, output builders, or workflow-related commands.

## Dependency Rules

- Do not add a Python or Node dependency unless the installation manifest is introduced or updated in the same change.
- Do not add browser automation unless the relevant adapter requires it and the workflow/install path is documented.
- `maaltalk` currently requires Playwright browser fallback because direct `goods_ps.php option_select` replay is not reliably accepted outside the browser session.
- Record new dependency control points in this file once they become part of the project.

## Workflow Standards

- Start every task by scanning the repository.
- Extend the existing `app/` plus `dashboard/` split instead of creating parallel app roots.
- Keep the registry-driven crawl flow simple; avoid speculative abstractions beyond the adapter boundary.
- Prefer `direct API` fallback over `browser` fallback when both are supported by a site.
- For `rokebi`, prefer parsing embedded `self.__next_f` payloads over brittle DOM selectors or unnecessary browser control.
- Keep smoke verification anchored on `dashboard/data/latest.json` generation and, when full publish is used, `dashboard/data/index.json` plus snapshot payload generation.

## AI Decision Rules

### Priority Order

1. Follow confirmed files and folders.
2. Follow `config/source_registry.yml`, `app/models.py`, and `app/output/paths.py` as primary contracts.
3. Follow explicit user requirements.
4. Minimize new structure.
5. Update this rules file when the structure becomes stable.

### If The Request Is Ambiguous

- Infer the smallest workable implementation from the current repository contents.
- Reuse the established Python package layout for crawler changes and static asset layout for dashboard changes.
- Ask the user only when the choice would lock in a major technical direction not implied by the current structure.

## Prohibited Actions

- Do not move source URLs out of `config/source_registry.yml` without replacing that contract everywhere.
- Do not couple dashboard rendering to raw site payload formats.
- Do not add a second schema definition outside `app/models.py`.
- Do not add a new site without fixture coverage and at least one adapter test.
- Do not change workflow commands without keeping local README commands aligned.
- Do not document nonexistent file relationships.
- Do not leave this file outdated after the project structure materially changes.
