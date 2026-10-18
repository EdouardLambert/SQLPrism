# SQL Prism

Visual readability for SQL and dbt in VS Code. 

**SQL Prism** enhances your SQL development experience by providing deterministic, hierarchical coloring for Common Table Expressions (CTEs), tables, aliases, and column references. It helps you instantly understand the flow of data and scope within complex queries without relying on heavy AST parsers.

## Features

- **Hierarchical CTE Coloring**: Each CTE is assigned a distinct base color. Tables and aliases declared inside the CTE receive automatically derived shades (lighter/darker) of that base color to avoid visual collision.
- **Visual Scope Guides**: A subtle, native-looking vertical line connects the start and end of each CTE block in the indentation margin, making it easy to track scope bounds.
- **Smart Parentheses**: Opening and closing parentheses of CTEs perfectly match the base color of their corresponding CTE.
- **Column Tracking**: Qualified column references (e.g., `customers.customer_id`) automatically inherit the color of their source table or CTE anywhere in the file.
- **Jinja & dbt Native**: Fully compatible with dbt Jinja syntax (`{{ ref('model') }}`, `{% if ... %}`). Macros and templating won't break the highlighting.

## Extension Settings

This extension contributes the following configurable settings under the `Cte` category:

* `sqlPrism.cte.enabled`: Enable or disable hierarchical coloring for CTEs, inner tables, and parentheses (Default: `true`).
* `sqlPrism.cte.showLine`: Show a subtle vertical line on the left side of each CTE block (Default: `true`).

## Installation

1. Open VS Code.
2. Go to the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X` on macOS).
3. Search for `SQL Prism`.
4. Click **Install**.

*To install locally from source:*
```bash
npm install
npx @vscode/vsce package
code --install-extension sql-prism-*.vsix