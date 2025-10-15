using Microsoft.AspNetCore.SignalR;
namespace DrowsinessDetectionApp.Hubs
{
    public class SensorHub : Hub
    {

        public async Task SendSensorData(object data)
        {
            await Clients.All.SendAsync("ReceiveSensorData", data);
        }
    }
}
