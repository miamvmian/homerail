export interface ContainerConfig {
  image: string;
  command?: string[];
  env?: Record<string, string>;
  mounts?: Array<{ host: string; container: string; mode?: string }>;
  ports?: Array<{
    hostPort: number | string;
    containerPort: number | string;
    hostIp?: string;
    protocol?: "tcp" | "udp";
  }>;
  labels?: Record<string, string>;
  network?: string;
  extraHosts?: string[];
  workdir?: string;
  name?: string;
}

export interface ContainerInfo {
  id: string;
  status: "created" | "running" | "stopped" | "removed";
  name?: string;
  labels?: Record<string, string>;
  exitCode?: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ExecutionProvider {
  create(config: ContainerConfig): Promise<ContainerInfo>;
  start(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  kill(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  exec(id: string, cmd: string[]): Promise<ExecResult>;
  logs(id: string): AsyncIterable<string>;
  inspect(id: string): Promise<ContainerInfo>;
  list(): Promise<ContainerInfo[]>;
}
