using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using DrowsinessDetectionApp.Hubs;

namespace DrowsinessDetectionApp.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SensorDataController : ControllerBase
    {
        private readonly IHubContext<SensorHub> _hubContext;

        public SensorDataController(IHubContext<SensorHub> hubContext)
        {
            _hubContext = hubContext;
        }

        [HttpPost]
        public async Task<IActionResult> Post([FromBody] SensorData data)
        {
            // Validate or process data if needed
            await _hubContext.Clients.All.SendAsync("ReceiveSensorData", data);
            return Ok();
        }
    }

    public class SensorData  // Match this to the data structure in JS
    {
        public long Timestamp { get; set; }
        public double EyeBlinkRate { get; set; }
        public double EyeClosureDuration { get; set; }
        public HeadMovement HeadMovement { get; set; }
        public double DrowsinessLevel { get; set; }
        public bool AlertTriggered { get; set; }
        public double BatteryLevel { get; set; }
    }

    public class HeadMovement
    {
        public double Pitch { get; set; }
        public double Roll { get; set; }
        public double Yaw { get; set; }
    }
}