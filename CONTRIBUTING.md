# 🤝 Contributing to Vibekit

First off — thank you for taking the time to contribute!  
Vibekit is an open framework designed to make **AI agent execution safer, sandboxed, and observable**.  
We welcome all kinds of contributions — from fixing typos to improving core agent execution code.

---

## 🪄 Table of contents
1. [Code of Conduct](#-code-of-conduct)
2. [Getting Started](#-getting-started)
3. [Project Structure](#-project-structure)
4. [Development Workflow](#-development-workflow)
5. [Branching & Commit Style](#-branching--commit-style)
6. [Testing & Linting](#-testing--linting)
7. [Pull Request Process](#-pull-request-process)
8. [Documentation Contributions](#-documentation-contributions)
9. [Issue Guidelines](#-issue-guidelines)
10. [Community & Support](#-community--support)

---

## ⚖️ Code of Conduct
Please note that Vibekit follows the [Contributor Covenant](https://www.contributor-covenant.org/).  
Be kind, constructive, and respectful in all interactions.

---

## 🚀 Getting Started

### 1. Fork the repository
Create your own copy of the repo under your GitHub account:
```bash
https://github.com/superagent-ai/vibekit/fork
````

### 2. Clone your fork

```bash
git clone https://github.com/<your-username>/vibekit.git
cd vibekit
```

### 3. Add the upstream remote

```bash
git remote add upstream https://github.com/superagent-ai/vibekit.git
```

### 4. Install dependencies

```bash
npm install
# or
pnpm install
```

---

## 🧱 Project Structure

```bash
vibekit/
├── packages/          # Core SDK and CLI packages
│   ├── sdk/           # Vibekit SDK logic
│   ├── cli/           # CLI entry and commands
│   └── utils/         # Shared utilities
├── examples/          # Example integrations (AI agents, sandbox demos)
├── docs/              # Documentation files
├── .github/           # GitHub workflows and templates
└── tests/             # Unit and integration tests
```

---

## 🧩 Development Workflow

1. Always create a **feature branch** from `main`:

   ```bash
   git checkout main
   git pull upstream main
   git checkout -b docs/contributing-guide
   ```
2. Make your changes, following the code and documentation style.
3. Run tests and linter locally.
4. Push your branch to your fork:

   ```bash
   git push origin docs/contributing-guide
   ```
5. Open a Pull Request (PR) targeting `superagent-ai/vibekit:main`.

---

## 🌿 Branching & Commit Style

We use simple, descriptive branch naming:

| Type          | Example                  |
| ------------- | ------------------------ |
| Documentation | `docs/update-readme`     |
| Feature       | `feat/add-sandbox-tests` |
| Fix           | `fix/docker-runtime-bug` |
| Refactor      | `refactor/cli-structure` |

Follow [Conventional Commits](https://www.conventionalcommits.org/) for messages:

```
feat: add CI workflow for sandbox tests
fix: resolve env path issue on Windows
docs: update contributing guide
```

---

## 🧪 Testing & Linting

Before pushing your changes, ensure:

```bash
npm run lint
npm test
```

Tests should pass locally and in CI.
If adding new features, include corresponding unit/integration tests.

---

## 🔁 Pull Request Process

1. Ensure your branch is up to date with `main`.
2. Run lint and tests — CI should pass before requesting review.
3. Use the **PR Template** (auto-loaded by GitHub).
4. Fill out the checklist and clearly describe your change.
5. Request review from maintainers or relevant code owners.
6. After approval, the maintainers will merge your PR.

---

## 📚 Documentation Contributions

Docs and examples are highly welcome!
You can improve:

* `README.md`
* `examples/` folder
* API references or usage guides in `docs/`

For non-code contributions, add label `documentation`.

---

## 🐞 Issue Guidelines

When creating an issue:

* Use one of the issue templates (`Bug Report`, `Feature Request`, `Docs Update`).
* Include steps to reproduce (for bugs).
* Suggest a clear solution (for features).
* Use labels like `good first issue`, `enhancement`, or `documentation`.

---

## 💬 Community & Support

* 💡 Ask questions or discuss new ideas in the **Discussions** tab.
* 🧠 Use Issues only for actionable bug reports or feature requests.
* 🛡️ Be patient and constructive — maintainers will triage your contribution ASAP.

---

## ❤️ Thank You!

Your time and contributions help make **AI agent engineering safer and more scalable**.
Together we’re shaping the next generation of open Agentic AI infrastructure.

---
