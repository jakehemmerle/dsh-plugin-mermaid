{ buildNpmPackage, fetchurl, jq, lib, runCommand }:

# dsh-TUI 0.14.0 exactly as published on npm, for the dsh-TUI inertness suite.
# Derived from nix-config pkgs/dsh-tui.nix (nix-config 6a7e613) WITHOUT the
# fleet's patches (launchpad-word-edit, dsh-omp-keys, model-selector-scene,
# preset-schedule-deny, launchpad-status, dsh-speed patch-tui): none of them
# touch dependencies, so the same package-lock.json and npmDepsHash apply.
# To test against the fleet's patched build instead, set DSH_TUI_DIR to its
# store path (see TESTING.md).
let
  version = "0.14.0";
  tarball = fetchurl {
    url = "https://registry.npmjs.org/@deepseek-harness-tui/dsh-tui/-/dsh-tui-${version}.tgz";
    hash = "sha512-syU0CLbAoxA97URyhnPFiLbWm3dXrmCR5NCO6mFovRi7mebX2HeEYdhpugEoT9vZ1vpUfE/+uX7xrs6zOGUJ1g==";
  };
  unlistedPeers = [
    "@deepseek-ai/cordis-plugin-include"
    "@deepseek-ai/dsh-agent-preset"
    "@deepseek-ai/dsh-attachment-local"
    "@deepseek-ai/dsh-mcp-client"
    "@deepseek-ai/dsh-session-persistence"
    "@deepseek-ai/dsh-session-persistence-jsonl"
  ];
  src = runCommand "dsh-tui-source-${version}" { nativeBuildInputs = [ jq ]; } ''
    mkdir -p $out
    tar -xzf ${tarball} -C $out --strip-components=1
    jq --argjson names '${builtins.toJSON unlistedPeers}' '
      .peerDependencies += ($names | map({ key: ., value: "*" }) | from_entries)
      | .peerDependenciesMeta += ($names | map({ key: ., value: { optional: true } }) | from_entries)' \
      $out/package.json > $out/package.json.runtime
    jq 'del(.devDependencies, .scripts, .bundledDependencies, .peerDependencies, .peerDependenciesMeta)
      | .optionalDependencies |= with_entries(select(.key | startswith("@dsh-") | not))' \
      $out/package.json.runtime > $out/package.json
    mv $out/node_modules $out/bundled
    cp ${./dsh-tui/package-lock.json} $out/package-lock.json
  '';
in
buildNpmPackage {
  pname = "dsh-tui";
  inherit version src;

  npmDepsFetcherVersion = 2;
  npmDepsHash = "sha256-EMVmgJJ3sc0iqN+vmW/t6vWtrQWANc50biq6h15XfpA=";
  npmFlags = [ "--legacy-peer-deps" "--ignore-scripts" ];
  dontNpmBuild = true;

  postInstall = ''
    pkg=$out/lib/node_modules/@deepseek-harness-tui/dsh-tui
    cp -r bundled/. $pkg/node_modules/
    cp package.json.runtime $pkg/package.json
    rm -r $out/bin
  '';

  meta = {
    description = "Terminal user interface for DeepSeek Harness (unpatched upstream, test fixture)";
    homepage = "https://github.com/ccch1mneyyy/dsh-TUI";
    license = lib.licenses.mit;
  };
}
