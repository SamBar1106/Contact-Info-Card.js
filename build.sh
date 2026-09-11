#!/bin/bash
echo "(function(){" > inspector.js
cat src/*.js >> inspector.js
echo "})();" >> inspector.js
echo "✅ Successfully built inspector.js!"