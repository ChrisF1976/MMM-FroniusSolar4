const NodeHelper = require("node_helper");
const axios = require("axios");

module.exports = NodeHelper.create({
    start: function () {
        this.config = {};
        this.lastShellyFetch = 0; // Timestamp of the last Shelly fetch
        this.shellyInterval = null;
        this.froniusInterval = null;
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === "MMM-FroniusSolar4_CONFIG") {
            this.config = payload;

            // Clear existing intervals if they exist
            clearInterval(this.froniusInterval);
            clearInterval(this.shellyInterval);

            // Start intervals for Fronius and Shelly
            if (this.config.updateInterval) {
                this.startFroniusUpdates();
            }
            if (this.config.updateIntervalShelly) {
                this.startShellyUpdates();
            }
        }
    },

    startFroniusUpdates: function () {
        this.froniusInterval = setInterval(async () => {
            try {
                const froniusData = await this.fetchFroniusData();
                this.sendSocketNotification("MMM-FroniusSolar4_FRONIUS_DATA", froniusData);
            } catch (error) {
                console.error("[MMM-FroniusSolar4] Error fetching Fronius data:", error.message || error);
            }
        }, this.config.updateInterval); // Typically 5 seconds
    },

    startShellyUpdates: function () {
        this.shellyInterval = setInterval(async () => {
            const now = Date.now();
            if (now - this.lastShellyFetch < this.config.updateIntervalShelly) {
                return; // Skip if less than 20 seconds since the last fetch
            }
            this.lastShellyFetch = now; // Update timestamp for last fetch

            try {
                const shellyData = await this.fetchShellyPVStatus();
                this.sendSocketNotification("MMM-FroniusSolar4_SHELLY_DATA", shellyData);
            } catch (error) {
                console.error("[MMM-FroniusSolar4] Error fetching Shelly data:", error.message || error);
            }
        }, 1000); // Check every second but respect the 20-second interval
    },

    fetchFroniusData: async function () {
        try {
            if (!this.config.InverterIP) {
                throw new Error("InverterIP is not defined.");
            }

            const serverUriFronius = `http://${this.config.InverterIP}/solar_api/v1/GetPowerFlowRealtimeData.fcgi`;
            const response = await axios.get(serverUriFronius);
            const data = response.data;

            return {
                P_Akku: data.Body?.Data?.Site?.P_Akku || 0,
                P_Grid: data.Body?.Data?.Site?.P_Grid || 0,
                P_Load: data.Body?.Data?.Site?.P_Load || 0,
                P_PV: data.Body?.Data?.Site?.P_PV || 0,
                SOC: data.Body?.Data?.Inverters?.["1"]?.SOC || 0, // State of Charge
            };
        } catch (error) {
            console.error("[MMM-FroniusSolar4] Error in fetchFroniusData:", error.message || error);
            return { P_Akku: 0, P_Grid: 0, P_Load: 0, P_PV: 0, SOC: 0 };
        }
    },

    fetchShellyPVStatus: async function () {
        const results = [];
        let totalShellyPower = 0;

        if (!this.config.shellysPV || !Array.isArray(this.config.shellysPV)) {
            return { devices: [], totalPower: 0 };
        }

        for (const shellyPV of this.config.shellysPV) {
            try {
                const response = await axios.post(
                    `${this.config.serverUriShelly}/device/status`,
                    `id=${shellyPV.id}&auth_key=${this.config.authKey}`,
                    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
                );

                const data = response.data?.data?.device_status;

                if (data) {
                    let power = 0;

                    // Check for Gen 1/2 structure (relay-based devices)
                    if (data.relays) {
                        const channel = parseInt(shellyPV.ch || 0, 10);
                        power = data.meters?.[channel]?.power || 0;
                    } else if (data["pm1:0"]) {
                        power = data["pm1:0"].apower || 0;
                    } else if (data["switch:0"]) {
                        power = data["switch:0"].apower || 0;
                    } else if (data.lights) {
                        power = data.meters ? data.meters[0].power || 0 : 0;
                    }

                    totalShellyPower += power;

                    results.push({
                        name: shellyPV.name,
                        power: power,
                    });
                } else {
                    results.push({
                        name: shellyPV.name,
                        power: null,
                    });
                }
            } catch (error) {
                results.push({
                    name: shellyPV.name,
                    power: null,
                });
            }
        }

        return {
            devices: results,
            totalPower: totalShellyPower,
        };
    },
});
