import { describe, it, expect } from "vitest";
import { dockerVolumeMount } from "../local-volume.js";

describe("local-volume", () => {
  describe("dockerVolumeMount", () => {
    it("maps host path to default /data container path", () => {
      const mount = dockerVolumeMount("/home/user/project");
      expect(mount.host).toBe("/home/user/project");
      expect(mount.container).toBe("/data");
    });

    it("respects explicit containerPath", () => {
      const mount = dockerVolumeMount("/home/user/project", "/workspace");
      expect(mount.container).toBe("/workspace");
    });

    it("passes through mode", () => {
      const ro = dockerVolumeMount("/path", "/data", "ro");
      expect(ro.mode).toBe("ro");

      const rw = dockerVolumeMount("/path", "/data", "rw");
      expect(rw.mode).toBe("rw");
    });

    it("normalizes Windows backslash paths to forward slashes", () => {
      const mount = dockerVolumeMount("C:\\Users\\test\\project");
      expect(mount.host).not.toContain("\\");
      expect(mount.host).toBe("C:/Users/test/project");
    });

    it("produces a valid VolumeMount shape", () => {
      const mount = dockerVolumeMount("/tmp", "/vol");
      expect(mount).toHaveProperty("host");
      expect(mount).toHaveProperty("container");
      expect(mount).toHaveProperty("mode");
      expect(typeof mount.host).toBe("string");
      expect(typeof mount.container).toBe("string");
      expect(typeof mount.mode).toBe("string");
    });
  });
});
