#!/bin/bash

# Inject API and UI into the Main skeleton
perl -pe 's|^\s*// INJECT_API_HERE|`cat src/01-api.js`|ge' src/03-main.js > inspector.tmp.js
perl -pe 's|^\s*// INJECT_UI_HERE|`cat src/02-ui.js`|ge' inspector.tmp.js > inspector.tmp2.js

echo "(function(){" > inspector.js
cat inspector.tmp2.js >> inspector.js
echo -n "})();" >> inspector.js

rm inspector.tmp.js inspector.tmp2.js