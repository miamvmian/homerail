import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateContainer = vi.fn();
const mockGetContainer = vi.fn();
const mockListContainers = vi.fn();
const mockDemuxStream = vi.fn();

vi.mock("dockerode", () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      createContainer: mockCreateContainer,
      getContainer: mockGetContainer,
      listContainers: mockListContainers,
      modem: { demuxStream: mockDemuxStream },
    };
  }),
}));

import { DockerApiProvider, resolveDockerApiOptions } from "../docker-api-provider.js";

function makeMockContainer(overrides: Record<string, unknown> = {}) {
  const inspect = vi.fn().mockResolvedValue({
    Id: "api-abc123",
    State: {
      Status: "running",
      ExitCode: 0,
      StartedAt: "2026-01-01T00:00:00Z",
      FinishedAt: "0001-01-01T00:00:00Z",
      Error: "",
    },
    ...overrides,
  });

  const start = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn().mockResolvedValue(undefined);
  const kill = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(undefined);
  const exec = vi.fn().mockResolvedValue({
    start: vi.fn().mockResolvedValue({
      on: vi.fn(),
    }),
    inspect: vi.fn(),
  });
  const logs = vi.fn();

  return {
    inspect,
    start,
    stop,
    kill,
    remove,
    exec,
    logs,
  };
}

describe("DockerApiProvider (unit, mocked dockerode)", () => {
  let provider: DockerApiProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new DockerApiProvider();
  });

  describe("create", () => {
    it("creates container via dockerode and returns ContainerInfo", async () => {
      const mockContainer = makeMockContainer();
      mockCreateContainer.mockResolvedValueOnce(mockContainer);

      const info = await provider.create({ image: "node:20-alpine" });
      expect(mockCreateContainer).toHaveBeenCalled();
      expect(info.id).toBe("api-abc123");
      expect(info.status).toBe("running");
    });

    it("passes env vars to dockerode", async () => {
      const mockContainer = makeMockContainer();
      mockCreateContainer.mockResolvedValueOnce(mockContainer);

      await provider.create({
        image: "node:20-alpine",
        env: { NODE_ENV: "production" },
      });

      const callArgs = mockCreateContainer.mock.calls[0]![0];
      expect(callArgs.Env).toContain("NODE_ENV=production");
    });

    it("passes mounts as structured HostConfig.Mounts", async () => {
      const mockContainer = makeMockContainer();
      mockCreateContainer.mockResolvedValueOnce(mockContainer);

      await provider.create({
        image: "node:20-alpine",
        mounts: [{ host: "/host/data", container: "/data", mode: "ro" }],
      });

      const callArgs = mockCreateContainer.mock.calls[0]![0];
      expect(callArgs.HostConfig.Mounts).toContainEqual({
        Type: "bind",
        Source: "/host/data",
        Target: "/data",
        ReadOnly: true,
      });
    });

    it("keeps Windows drive paths intact in structured mounts", async () => {
      const mockContainer = makeMockContainer();
      mockCreateContainer.mockResolvedValueOnce(mockContainer);

      await provider.create({
        image: "node:20-alpine",
        mounts: [{
          host: "D:/work/HomeRail/.homerail/workspaces/run-1",
          container: "/workspace",
          mode: "rw",
        }],
      });

      const callArgs = mockCreateContainer.mock.calls[0]![0];
      expect(callArgs.HostConfig.Mounts).toContainEqual({
        Type: "bind",
        Source: "D:/work/HomeRail/.homerail/workspaces/run-1",
        Target: "/workspace",
        ReadOnly: false,
      });
    });

    it("keeps Windows paths with spaces intact in structured mounts", async () => {
      const mockContainer = makeMockContainer();
      mockCreateContainer.mockResolvedValueOnce(mockContainer);

      await provider.create({
        image: "node:20-alpine",
        mounts: [{
          host: "D:/HomeRail Data/workspaces/run 1",
          container: "/workspace",
          mode: "rw",
        }],
      });

      const callArgs = mockCreateContainer.mock.calls[0]![0];
      expect(callArgs.HostConfig.Mounts).toContainEqual({
        Type: "bind",
        Source: "D:/HomeRail Data/workspaces/run 1",
        Target: "/workspace",
        ReadOnly: false,
      });
    });

    it("keeps UNC paths intact in structured mounts", async () => {
      const mockContainer = makeMockContainer();
      mockCreateContainer.mockResolvedValueOnce(mockContainer);

      await provider.create({
        image: "node:20-alpine",
        mounts: [{
          host: "//server/share/HomeRail/workspaces/run-1",
          container: "/workspace",
          mode: "ro",
        }],
      });

      const callArgs = mockCreateContainer.mock.calls[0]![0];
      expect(callArgs.HostConfig.Mounts).toContainEqual({
        Type: "bind",
        Source: "//server/share/HomeRail/workspaces/run-1",
        Target: "/workspace",
        ReadOnly: true,
      });
    });

    it("passes port bindings to dockerode", async () => {
      const mockContainer = makeMockContainer();
      mockCreateContainer.mockResolvedValueOnce(mockContainer);

      await provider.create({
        image: "node:20-alpine",
        ports: [{ hostIp: "127.0.0.1", hostPort: 39001, containerPort: 9001 }],
      });

      const callArgs = mockCreateContainer.mock.calls[0]![0];
      expect(callArgs.ExposedPorts).toEqual({ "9001/tcp": {} });
      expect(callArgs.HostConfig.PortBindings).toEqual({
        "9001/tcp": [{ HostIp: "127.0.0.1", HostPort: "39001" }],
      });
    });

    it("passes extra hosts as HostConfig.ExtraHosts", async () => {
      const mockContainer = makeMockContainer();
      mockCreateContainer.mockResolvedValueOnce(mockContainer);

      await provider.create({
        image: "node:20-alpine",
        extraHosts: ["host.docker.internal:host-gateway"],
      });

      const callArgs = mockCreateContainer.mock.calls[0]![0];
      expect(callArgs.HostConfig.ExtraHosts).toContain("host.docker.internal:host-gateway");
    });
  });

  describe("start", () => {
    it("starts container by ID", async () => {
      const mockContainer = makeMockContainer();
      mockGetContainer.mockReturnValueOnce(mockContainer);

      await provider.start("api-abc123");
      expect(mockGetContainer).toHaveBeenCalledWith("api-abc123");
      expect(mockContainer.start).toHaveBeenCalled();
    });
  });

  describe("stop", () => {
    it("stops container by ID", async () => {
      const mockContainer = makeMockContainer();
      mockGetContainer.mockReturnValueOnce(mockContainer);

      await provider.stop("api-abc123");
      expect(mockContainer.stop).toHaveBeenCalled();
    });
  });

  describe("kill", () => {
    it("kills container by ID", async () => {
      const mockContainer = makeMockContainer();
      mockGetContainer.mockReturnValueOnce(mockContainer);

      await provider.kill("api-abc123");
      expect(mockContainer.kill).toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("force-removes container by ID", async () => {
      const mockContainer = makeMockContainer();
      mockGetContainer.mockReturnValueOnce(mockContainer);

      await provider.remove("api-abc123");
      expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
    });
  });

  describe("inspect", () => {
    it("returns ContainerInfo from docker inspect", async () => {
      const mockContainer = makeMockContainer();
      mockGetContainer.mockReturnValueOnce(mockContainer);

      const info = await provider.inspect("api-abc123");
      expect(info.id).toBe("api-abc123");
      expect(info.status).toBe("running");
    });

    it("normalizes 'exited' to 'stopped'", async () => {
      const mockContainer = makeMockContainer({
        State: { Status: "exited", ExitCode: 1 },
      });
      mockGetContainer.mockReturnValueOnce(mockContainer);

      const info = await provider.inspect("api-abc123");
      expect(info.status).toBe("stopped");
      expect(info.exitCode).toBe(1);
    });
  });

  describe("list", () => {
    it("returns list of containers", async () => {
      mockListContainers.mockResolvedValueOnce([
        { Id: "c1", State: "running", Status: "Up 1 hour", Created: 1700000000 },
        { Id: "c2", State: "exited", Status: "Exited (0)", Created: 1700000001 },
      ]);

      const containers = await provider.list();
      expect(containers).toHaveLength(2);
      expect(containers[0]!.id).toBe("c1");
      expect(containers[0]!.status).toBe("running");
      expect(containers[1]!.id).toBe("c2");
      expect(containers[1]!.status).toBe("stopped");
    });
  });
});

describe("resolveDockerApiOptions", () => {
  it("uses the Docker Desktop named pipe on Windows when no endpoint is configured", () => {
    expect(resolveDockerApiOptions(undefined, "win32", {})).toEqual({
      socketPath: "//./pipe/docker_engine",
    });
  });

  it("does not override explicit dockerode options", () => {
    expect(resolveDockerApiOptions({ host: "127.0.0.1", port: 2375 }, "win32", {})).toEqual({
      host: "127.0.0.1",
      port: 2375,
    });
  });

  it("lets Docker environment variables drive connection defaults", () => {
    expect(resolveDockerApiOptions(undefined, "win32", { DOCKER_HOST: "tcp://127.0.0.1:2375" })).toBeUndefined();
  });
});
