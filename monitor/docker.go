package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
)

type ContainerStat struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Image      string  `json:"image"`
	State      string  `json:"state"`
	Status     string  `json:"status"`
	CPUPercent float64 `json:"cpu_percent"`
	MemUsed    uint64  `json:"mem_used"`
	MemLimit   uint64  `json:"mem_limit"`
	MemPercent float64 `json:"mem_percent"`
	NetRx      uint64  `json:"net_rx"`
	NetTx      uint64  `json:"net_tx"`
	Created    int64   `json:"created"`
}

func newDockerClient() (*client.Client, error) {
	return client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
}

func collectContainers() ([]ContainerStat, error) {
	cli, err := newDockerClient()
	if err != nil {
		return nil, err
	}
	defer cli.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	list, err := cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, err
	}

	out := make([]ContainerStat, 0, len(list))
	for _, c := range list {
		cs := ContainerStat{
			ID:      c.ID[:12],
			Image:   c.Image,
			State:   c.State,
			Status:  c.Status,
			Created: c.Created,
		}
		if len(c.Names) > 0 {
			cs.Name = strings.TrimPrefix(c.Names[0], "/")
		}
		if c.State == "running" {
			if raw, err := containerStats(cli, c.ID); err == nil {
				cs.CPUPercent = raw.cpu
				cs.MemUsed = raw.memUsed
				cs.MemLimit = raw.memLimit
				cs.MemPercent = raw.memPct
				cs.NetRx = raw.netRx
				cs.NetTx = raw.netTx
			}
		}
		out = append(out, cs)
	}
	return out, nil
}

type rawStat struct {
	cpu      float64
	memUsed  uint64
	memLimit uint64
	memPct   float64
	netRx    uint64
	netTx    uint64
}

func containerStats(cli *client.Client, id string) (rawStat, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := cli.ContainerStats(ctx, id, false)
	if err != nil {
		return rawStat{}, err
	}
	defer resp.Body.Close()

	var v types.StatsJSON
	if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
		return rawStat{}, err
	}

	// CPU %
	cpuDelta := float64(v.CPUStats.CPUUsage.TotalUsage - v.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(v.CPUStats.SystemUsage - v.PreCPUStats.SystemUsage)
	numCPU := float64(v.CPUStats.OnlineCPUs)
	if numCPU == 0 {
		numCPU = float64(len(v.CPUStats.CPUUsage.PercpuUsage))
	}
	var cpuPct float64
	if sysDelta > 0 && cpuDelta > 0 {
		cpuPct = (cpuDelta / sysDelta) * numCPU * 100.0
	}

	// Memory — works for cgroups v1 and v2
	cache := v.MemoryStats.Stats["cache"]
	if cache == 0 {
		cache = v.MemoryStats.Stats["inactive_file"]
	}
	memUsed := v.MemoryStats.Usage
	if cache < memUsed {
		memUsed -= cache
	}
	memLimit := v.MemoryStats.Limit
	var memPct float64
	if memLimit > 0 {
		memPct = float64(memUsed) / float64(memLimit) * 100
	}

	// Network I/O
	var rx, tx uint64
	for _, n := range v.Networks {
		rx += n.RxBytes
		tx += n.TxBytes
	}

	return rawStat{
		cpu:      r2(cpuPct),
		memUsed:  memUsed,
		memLimit: memLimit,
		memPct:   r2(memPct),
		netRx:    rx,
		netTx:    tx,
	}, nil
}

func fetchLogs(id string, tail int) ([]string, error) {
	cli, err := newDockerClient()
	if err != nil {
		return nil, err
	}
	defer cli.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	opts := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       fmt.Sprintf("%d", tail),
		Timestamps: true,
	}
	reader, err := cli.ContainerLogs(ctx, id, opts)
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	var buf bytes.Buffer
	if _, err := stdcopy.StdCopy(&buf, &buf, reader); err != nil && err != io.EOF {
		// Fallback: some containers use raw stream (no multiplexing header)
		buf.Reset()
		io.Copy(&buf, reader) //nolint:errcheck
	}

	raw := strings.TrimSpace(buf.String())
	if raw == "" {
		return []string{}, nil
	}
	return strings.Split(raw, "\n"), nil
}
