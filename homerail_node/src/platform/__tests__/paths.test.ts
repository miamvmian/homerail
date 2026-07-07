import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveHomerailHome, normalizePath, isWindows, isMacOS, isLinux } from "../paths.js";

describe("paths", () => {
  describe("normalizePath", () => {
    it("converts backslashes to forward slashes", () => {
      expect(normalizePath("C:\\Users\\test")).toBe("C:/Users/test");
    });

    it("strips trailing slash", () => {
      expect(normalizePath("/home/user/")).toBe("/home/user");
    });

    it("does not strip root slash", () => {
      expect(normalizePath("/")).toBe("/");
    });

    it("leaves already-normalized paths unchanged", () => {
      expect(normalizePath("/home/user/project")).toBe("/home/user/project");
    });
  });

  describe("resolveHomerailHome", () => {
    const originalHome = process.env["HOMERAIL_HOME"];

    afterEach(() => {
      if (originalHome === undefined) {
        delete process.env["HOMERAIL_HOME"];
      } else {
        process.env["HOMERAIL_HOME"] = originalHome;
      }
    });

    it("uses HOMERAIL_HOME env var when set", () => {
      process.env["HOMERAIL_HOME"] = "/custom/homerail/home";
      expect(resolveHomerailHome()).toBe("/custom/homerail/home");
    });

    it("defaults to ~/.homerail when HOMERAIL_HOME is unset", () => {
      delete process.env["HOMERAIL_HOME"];
      const result = resolveHomerailHome();
      expect(result).toMatch(/\.homerail$/);
    });

    it("normalizes Windows HOMERAIL_HOME value", () => {
      process.env["HOMERAIL_HOME"] = "C:\\Users\\test\\.homerail";
      expect(resolveHomerailHome()).toBe("C:/Users/test/.homerail");
    });
  });

  describe("platform detection", () => {
    it("exactly one platform flag is true", () => {
      const count = [isWindows, isMacOS, isLinux].filter(Boolean).length;
      expect(count).toBe(1);
    });

    it("matches process.platform", () => {
      if (process.platform === "win32") expect(isWindows).toBe(true);
      if (process.platform === "darwin") expect(isMacOS).toBe(true);
      if (process.platform === "linux") expect(isLinux).toBe(true);
    });
  });

  describe("cross-platform path translation", () => {
    it("normalizes Windows drive letter paths", () => {
      expect(normalizePath("C:\\Program Files\\App")).toBe("C:/Program Files/App");
      expect(normalizePath("D:\\data\\volumes")).toBe("D:/data/volumes");
    });

    it("normalizes mixed Windows forward/backslash paths", () => {
      expect(normalizePath("C:\\Users/test\\project")).toBe("C:/Users/test/project");
    });

    it("handles macOS home directory paths", () => {
      expect(normalizePath("/Users/janedoe/.homerail/")).toBe("/Users/janedoe/.homerail");
    });

    it("handles WSL2 /mnt paths", () => {
      expect(normalizePath("/mnt/c/Users/test/.homerail")).toBe("/mnt/c/Users/test/.homerail");
    });

    it("handles UNC paths by converting backslashes", () => {
      expect(normalizePath("\\\\server\\share\\path")).toBe("//server/share/path");
    });
  });
});
