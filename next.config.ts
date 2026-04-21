import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit contient des fichiers de polices .afm qui ne sont pas bundles par webpack par defaut
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
