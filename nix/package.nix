{
  lib,
  stdenv,
  nodejs,
  pnpm_10,
  fetchPnpmDeps,
  pnpmConfigHook,
}:

stdenv.mkDerivation (finalAttrs: {
  pname = "dsh-plugin-mermaid";
  version = (lib.importJSON ../package.json).version;

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../build.mjs
      ../lib/index.js
      ../package.json
      ../pnpm-lock.yaml
      ../pnpm-workspace.yaml
      ../src
      ../test
      ../tsconfig.json
      ../vitest.config.ts
    ];
  };

  nativeBuildInputs = [
    nodejs
    pnpm_10
    pnpmConfigHook
  ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm_10;
    fetcherVersion = 4;
    hash = "sha256-yaT3kKe2MWeJUVF1xuP51XS23k7ABbkDvH6g6H64VbY=";
  };

  buildPhase = ''
    runHook preBuild
    node build.mjs
    runHook postBuild
  '';

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    pnpm exec tsc --noEmit
    pnpm exec vitest run --project unit
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r lib package.json $out/
    runHook postInstall
  '';

  meta = {
    description = "DeepSeek Harness (dsh) web plugin that renders mermaid code fences as diagrams";
    homepage = "https://github.com/jakehemmerle/dsh-plugin-mermaid";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "aarch64-darwin"
    ];
  };
})
