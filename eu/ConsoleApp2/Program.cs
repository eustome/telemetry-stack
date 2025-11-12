using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using System.Security.Cryptography;

namespace telemetryclient
{
    internal class program
    {
        private static void Main(string[] args)
        {
            // основные переменные
            var base_url = Environment.GetEnvironmentVariable("API_URL") ?? "http://localhost:8000";
            var token = Environment.GetEnvironmentVariable("API_TOKEN") ?? "telemetry-secret-token";
            var agent_id = Environment.GetEnvironmentVariable("AGENT_ID") ?? Environment.MachineName.ToLowerInvariant();
            var hmac_secret = Environment.GetEnvironmentVariable("HMAC_SECRET") ?? "telemetry-hmac-secret";
            var queue_path = Environment.GetEnvironmentVariable("QUEUE_PATH") ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "queue");
            var interval_value = Environment.GetEnvironmentVariable("INTERVAL_SECONDS");
            var interval_seconds = 5;
            if (int.TryParse(interval_value, out var parsed_interval) && parsed_interval > 0) { interval_seconds = parsed_interval; }
            var collector = new telemetrycollector();
            using (var sender = new httpsender(base_url, token, hmac_secret, queue_path))
            {
                // цикл тиков
                while (true)
                {
                    
                    try 
                    { sender.flush_offline().GetAwaiter().GetResult(); }
                    catch (Exception flush_ex) 
                    { Console.WriteLine($"{DateTime.UtcNow:o} flush failed: {flush_ex.Message}"); }

                    var batch = collector.collect(agent_id);
                    try
                    {
                        sender.send(batch).GetAwaiter().GetResult();
                        Console.WriteLine($"{DateTime.UtcNow:o} sent {batch.events.Count} events"); 
                    }
                    catch (Exception ex)
                    { Console.WriteLine($"{DateTime.UtcNow:o} send failed: {ex.Message}"); }
                    Thread.Sleep(TimeSpan.FromSeconds(interval_seconds));
                }
            }
        }
    }
    // осн. класс для сборки телеметрии
    internal class telemetrycollector
    {
        private readonly PerformanceCounter cpu_counter;
        private readonly PerformanceCounter memory_counter;

        internal telemetrycollector()
        {
            cpu_counter = new PerformanceCounter("Processor", "% Processor Time", "_Total");
            memory_counter = new PerformanceCounter("Memory", "Available MBytes");
            cpu_counter.NextValue();
            Thread.Sleep(500);
        }

        internal batchpayload collect(string agent_id)
        {
            var events = new List<eventpayload>();
            events.Add(collect_metric());
            events.AddRange(collect_processes());

            return new batchpayload
            {
                agent_id = agent_id,
                ts = DateTime.UtcNow,
                platform = "windows",
                events = events
            };
        }

        private eventpayload collect_metric()
        {
            var first = cpu_counter.NextValue();
            Thread.Sleep(200);
            var second = cpu_counter.NextValue();
            var cpu = Math.Max(0, Math.Min(1, second / 100.0));
            var available_mb = memory_counter.NextValue();
            var mem_free = (long)(available_mb * 1024 * 1024);

            return new eventpayload
            {
                type = "metric",
                cpu = Math.Round(cpu, 4),
                mem_free = mem_free
            };
        }

        private IEnumerable<eventpayload> collect_processes()
        {
            var first = Process.GetProcesses();
            var first_time = DateTime.UtcNow;
            var first_map = new Dictionary<int, TimeSpan>();
            foreach (var process in first)
            {
                try
                {
                    first_map[process.Id] = process.TotalProcessorTime;
                }
                catch{}
                finally { process.Dispose(); }
            }
            Thread.Sleep(500);
            var second = Process.GetProcesses();
            var second_time = DateTime.UtcNow;
            var interval = (second_time - first_time).TotalSeconds;
            if (interval <= 0)
            {
                interval = 0.5;
            }
            var stats = new List<processstat>();
            foreach (var process in second)
            {
                try
                {
                    if (first_map.TryGetValue(process.Id, out var previous))
                    {
                        var delta = (process.TotalProcessorTime - previous).TotalSeconds;
                        var cpu = delta / (Environment.ProcessorCount * interval);
                        if (cpu < 0)
                        {
                            cpu = 0;
                        }

                        stats.Add(new processstat
                        {
                            pid = process.Id,
                            name = process.ProcessName,
                            cpu = cpu,
                            rss = process.WorkingSet64
                        });
                    }
                }
                catch{}
                finally { process.Dispose(); }
            }

            return stats
                .OrderByDescending(x => x.cpu)
                .Take(3)
                .Where(x => x.cpu > 0)
                .Select(x => new eventpayload
                {
                    type = "proc",
                    pid = x.pid,
                    name = x.name,
                    cpu = Math.Round(x.cpu, 4),
                    rss = x.rss
                })
                .ToList();
        }
    }

    internal class processstat
    {
        internal int pid { get; set; }
        internal string name { get; set; }
        internal double cpu { get; set; }
        internal long rss { get; set; }
    }
    // основной хттп класс
    internal class httpsender : IDisposable
    {
        private readonly HttpClient client;
        private readonly Uri ingest_uri;
        private readonly string token;
        private readonly byte[] secret_key;
        private readonly diskqueue queue;
        internal httpsender(string base_url, string token, string secret, string queue_path)
        {
            client = new HttpClient();
            ingest_uri = new Uri(new Uri(base_url), "/api/ingest");
            this.token = token;
            secret_key = Encoding.UTF8.GetBytes(secret);
            queue = new diskqueue(queue_path);
        }
        // оффлайн флуш
        internal async Task flush_offline()
        {
            foreach (var entry in queue.pending())
            {
                var json = queue.read(entry);
                await post(json);
                queue.remove(entry);
                Console.WriteLine($"{DateTime.UtcNow:o} flushed stored batch {Path.GetFileName(entry)}");
            }
        }
        // апи сенд
        internal async Task send(batchpayload batch)
        {
            var json = JsonConvert.SerializeObject(
                batch,
                Formatting.None,
                new JsonSerializerSettings
                {
                    NullValueHandling = NullValueHandling.Ignore
                });
            try
            {
                await post(json);
            }
            catch
            {
                queue.enqueue(json);
                throw;
            }
        }

        // апи пост
        private async Task post(string json)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, ingest_uri);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");
            request.Headers.Add("X-Api-Token", token);
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
            var signature = compute_signature(timestamp, json);
            request.Headers.Add("X-Signature-Ts", timestamp);
            request.Headers.Add("X-Signature", signature);
            var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync();
                throw new InvalidOperationException($"ingest failed: {(int)response.StatusCode} {body}");
            }
        }
        // проверка HMAC
        private string compute_signature(string timestamp, string json)
        {
            using (var hmac = new HMACSHA256(secret_key))
            {
                var message = Encoding.UTF8.GetBytes(timestamp + "." + json);
                var digest = hmac.ComputeHash(message);
                var builder = new StringBuilder(digest.Length * 2);
                foreach (var b in digest)
                {
                    builder.Append(b.ToString("x2"));
                }
                return builder.ToString();
            }
        }

        public void Dispose()
        {
            client.Dispose();
        }
    }
    // класс для обработки очереди
    internal class diskqueue
    {
        private readonly string directory;

        internal diskqueue(string directory)
        {
            this.directory = directory;
            Directory.CreateDirectory(this.directory);
        }
        internal void enqueue(string payload)
        {
            var name = $"{DateTime.UtcNow:yyyyMMddHHmmssffff}_{Guid.NewGuid():N}.json";
            var path = Path.Combine(directory, name);
            File.WriteAllText(path, payload, Encoding.UTF8);
        }

        internal IEnumerable<string> pending()
        {
            return Directory.GetFiles(directory, "*.json").OrderBy(x => x);
        }

        internal string read(string path)
        {
            return File.ReadAllText(path, Encoding.UTF8);
        }

        internal void remove(string path)
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
    }
    // пейлоад осн. информации
    internal class batchpayload
    {
        public string agent_id { get; set; }
        public DateTime ts { get; set; }
        public string platform { get; set; }
        public List<eventpayload> events { get; set; }
    }
    // пейлоад вторичной информации
    internal class eventpayload
    {
        public string type { get; set; }
        public double? cpu { get; set; }
        public long? mem_free { get; set; }
        public int? pid { get; set; }
        public string name { get; set; }
        public long? rss { get; set; }
    }
}
