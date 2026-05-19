import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Allows serverless functions (e.g. /api/status) to read files from
  // the data/ directory which lives one level above web/.
  outputFileTracingRoot: path.join(__dirname, "../"),
};

export default nextConfig;
