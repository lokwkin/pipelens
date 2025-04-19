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
cd "$ROOT_DIR/packages/lib-ts"
npm version $ACTUAL_VERSION --no-git-tag-version

# Update lib-py package
echo "Updating lib-py package to version $ACTUAL_VERSION"
cd "$ROOT_DIR/packages/lib-py"
poetry version $ACTUAL_VERSION

# Update dashboard package
echo "Updating dashboard package to version $ACTUAL_VERSION"
cd "$ROOT_DIR/packages/dashboard"
npm version $ACTUAL_VERSION --no-git-tag-version

# Return to root directory
cd "$ROOT_DIR"

# Commit changes to git
echo "Committing version update to git..."
git add .
git commit -m "v$ACTUAL_VERSION"

# Create git tag
echo "Creating git tag v$ACTUAL_VERSION..."
git tag -a "v$ACTUAL_VERSION" -m "Version $ACTUAL_VERSION"

echo "Version update complete!"
echo "Root and all packages are now at version $ACTUAL_VERSION"
echo "Changes committed to git with message: v$ACTUAL_VERSION"
echo "Created git tag: v$ACTUAL_VERSION" 
