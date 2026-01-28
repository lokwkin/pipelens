#!/bin/bash

# Check if version argument is provided
if [ $# -eq 0 ]; then
  echo "Usage: $0 <new_version>"
  echo "Example: $0 2.0.0"
  echo "Alternative: $0 major|minor|patch|premajor|preminor|prepatch|prerelease"
  exit 1
fi

NEW_VERSION=$1
ROOT_DIR=$(pwd)

# Check if git repository is clean
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Git repository has uncommitted changes. Please commit or stash them first."
  exit 1
fi

# Update root package.json
echo "Updating root package.json to version $NEW_VERSION"
npm version $NEW_VERSION --no-git-tag-version

# Capture the actual version number from package.json
ACTUAL_VERSION=$(node -p "require('./package.json').version")
echo "New version number: $ACTUAL_VERSION"

# Update lib-ts package
echo "Updating lib-ts package to version $ACTUAL_VERSION"
cd "$ROOT_DIR/lib-ts" || exit 1
npm version $ACTUAL_VERSION --no-git-tag-version || exit 1

# Update lib-py package
echo "Updating lib-py package to version $ACTUAL_VERSION"
cd "$ROOT_DIR/lib-py" || exit 1
poetry version $ACTUAL_VERSION || exit 1

# Update dashboard package
echo "Updating dashboard package to version $ACTUAL_VERSION"
cd "$ROOT_DIR/dashboard" || exit 1
npm version $ACTUAL_VERSION --no-git-tag-version || exit 1

# Return to root directory
cd "$ROOT_DIR" || exit 1

# Commit changes to git
echo "Committing version update to git..."
git add . || exit 1
git commit -m "v$ACTUAL_VERSION" || exit 1

# Create git tag
echo "Creating git tag v$ACTUAL_VERSION..."
git tag -a "v$ACTUAL_VERSION" -m "Version $ACTUAL_VERSION" || exit 1

echo "Version update complete!"
echo "Root and all packages are now at version $ACTUAL_VERSION"
echo "Changes committed to git with message: v$ACTUAL_VERSION"
echo "Created git tag: v$ACTUAL_VERSION" 
