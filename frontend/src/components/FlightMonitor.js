import React, { useState, useEffect } from "react";
import axios from "axios";

const FlightMonitor = () => {
  const [flights, setFlights] = useState([]);
  const [interval, setInterval] = useState(30); // 30 minutes interval initially

  useEffect(() => {
    const fetchFlightData = async () => {
      const response = await axios.get("https://api.example.com/flights");
      setFlights(response.data);
    };

    fetchFlightData();
    const intervalId = setInterval(fetchFlightData, interval * 60 * 1000); // Fetch every `interval` minutes

    return () => clearInterval(intervalId); // Cleanup on unmount
  }, [interval]);

  const handleStatusChange = (flightId) => {
    // Call API to update flight status or notify system
    axios.post("https://api.example.com/notify", { flightId })
      .then(response => {
        alert(`Status for flight ${flightId} updated`);
      });
  };

  return (
    <div>
      <h2>Flight Monitor</h2>
      <ul>
        {flights.map(flight => (
          <li key={flight.id}>
            {flight.flightNo} - {flight.status} 
            <button onClick={() => handleStatusChange(flight.id)}>Notify</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default FlightMonitor;
