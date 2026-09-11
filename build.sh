#!/bin/bash
echo "(function(){" > inspector.js
cat src/*.js >> inspector.js
echo -n "})();" >> inspector.js