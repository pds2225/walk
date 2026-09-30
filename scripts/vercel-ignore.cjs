const WALK_PROJECT_ID = "prj_oAKXh05oilzBd9h5CeMw6gcppSuq";
const WORLD_CUP_PROJECT_ID = "prj_87r30cKYvuPS8oCu4ijAt34mrdqg";
const WORLD_CUP_BRANCH = "feat/worldcup-market-demo";

const projectId = process.env.VERCEL_PROJECT_ID ?? "";
const branch = process.env.VERCEL_GIT_COMMIT_REF ?? "";

let shouldBuild = false;

if (projectId === WALK_PROJECT_ID) {
  shouldBuild = branch !== WORLD_CUP_BRANCH;
} else if (projectId === WORLD_CUP_PROJECT_ID) {
  shouldBuild = branch === WORLD_CUP_BRANCH;
}

// Vercel ignoreCommand semantics:
// exit 0 = skip deployment, exit 1 = continue deployment.
process.exit(shouldBuild ? 1 : 0);
