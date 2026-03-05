# Claude AI Assistant Instructions

## Verification Workflow

When making code changes to this project:

1. **Do not verify in the browser** - The user will verify visual changes in the browser themselves
2. **Always verify via build tools** - After making changes, run:
   - `npx tsc --noEmit` - TypeScript type checking
   - `npm run build` - Full production build

Both commands must complete successfully with no errors before marking work as done.
