Module.register("MMM-FroniusSolar4", {
    defaults: {
	InverterIP: "192.168.178.134",
	serverUriShelly: "https://shelly-55-eu.shelly.cloud",
	authKey: "<your-shelly-auth-key>",
	updateInterval: 5*1000, // Update every 5 seconds
        updateIntervalShelly: 30*1000, // Update every 30 seconds
	shellysPV: [
                        { name: "PV Mini1", id: "xxxxxx" },
			{ name: "PV Mini2", id: "xxxxxx" },
			// Weitere Geräte hinzufügen
		   ],
	icons: {
            P_Akku: "mdi:car-battery",
            P_Grid: "mdi:transmission-tower",
            P_Load: "mdi:home-lightbulb",
            P_PV: "mdi:solar-panel-large",
	    P_Shelly: "mdi:solar-panel-large",
        },
        Radius: 80, // Radius for the SVG gauges
        MaxPower: 1000, // Maximum power for grid, house, and battery
        MaxPowerPV: 10400, // Maximum power for solar PV
	MaxPowerShelly: 600, // Maximum power for shelly PV
	ShowText: true,
        TextMessge: [
            { about: "600", Text: "Leicht erhöhter Netzbezug.", color: "#999" },
            { about: "1000", Text: "Über 1 KW Netzbezug!", color: "#ffffff" },
            { about: "1500", Text: "Über 1,5KW Netzbezug.", color: "#eea205" },
            { about: "2500", Text: "Über 2,5KW aus dem Netz!", color: "#ec7c25" },
            { about: "5000", Text: "Auto lädt, richtig? Nächstes Mal auf Sonne warten.", color: "#cc0605" },
            { less: "-500", Text: "Sonne scheint! Mehr als 500W frei.", color: "#f8f32b" },
            { less: "-2000", Text: "Wäsche waschen! Über 2KW freie Energie!", color: "#00bb2d" },
            { less: "-4000", Text: "Auto laden! Über 4KW freie Energie!", color: "#f80000" },
        ],
    },


    start: function () {
        this.solarData = {
            P_Akku: 0,
            P_Grid: 0,
            P_Load: 0,
            P_PV: 0,
            P_Shelly: 0,
        };
        this.solarSOC = 0;
        this.sendSocketNotification("MMM-FroniusSolar4_CONFIG", this.config);
    },

    getStyles: function () {
        return ["MMM-FroniusSolar4.css", "https://code.iconify.design/2/2.2.1/iconify.min.js"];
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === "MMM-FroniusSolar4_FRONIUS_DATA") {
            this.solarData.P_Akku = Math.round(payload.P_Akku || 0);
            this.solarData.P_Grid = Math.round(payload.P_Grid || 0);
            this.solarData.P_Load = Math.round(payload.P_Load || 0);
            this.solarData.P_PV = Math.round(payload.P_PV || 0);
            this.solarSOC = Math.round(payload.SOC || 0);
        } 
	
	else if (notification === "MMM-FroniusSolar4_SHELLY_DATA") {
            this.solarData.P_Shelly = Math.abs(Math.round(payload.totalPower || 0));
        }
        
	this.updateDom();
    },



    getDom: function () {
        const wrapper = document.createElement("div");
        wrapper.className = "solar4-wrapper";

        if (!this.solarData) {
            wrapper.innerHTML = "Loading...";
            return wrapper;
        }


        const radius = this.config.Radius || 80;
        const strokeWidth = 12;
        const svgSize = 450; // Adjusted SVG height for labels and padding

        // Recalculate house consumption
        const outerPower = this.solarData.P_Grid + this.solarData.P_Akku + this.solarData.P_PV - this.solarData.P_Shelly;

        // Fixed positions for the gauges in dice layout
        const positions = {
            PV:     { x: radius + 10, y: radius + 25 },
            Grid:   { x: (radius * 5)+10, y: radius + 25 },
            Akku:   { x: radius + 10, y: (radius * 5)+25 },
            House:  { x: (radius * 3)+10, y:  (radius * 3)+25 },
	    Shelly: { x: (radius * 5)+10 , y: (radius * 5)+25 },
        };

        // Define colors for gauges
        const gridColor = this.solarData.P_Grid >= 0 ? "#808080" : "#add8e6"; // Gray for positive, light blue for negative
        const akkuColor = "#00ff00"; // Always green
        const pvColor = "#ffff00"; // Always yellow
	const shellyColor = "#ffff00"; // Always yellow

        // House Gauge: Logic for color determination
        let houseColor;
        if (this.solarData.P_Akku - 100 > Math.abs(this.solarData.P_Grid)) {
            houseColor = "#a3c49f"; // Light green for high battery activity
        } else if (this.solarData.P_Grid > 150) {
            houseColor = "#808080"; // Gray for high grid consumption
        } else if (outerPower > 0) {
            houseColor = "#00ff00"; // Green for positive power flow
        } else {
            houseColor = "#1f84ff"; // Light blue
        }

        // Create unified SVG
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", 350);
        svg.setAttribute("height", 400);
        svg.setAttribute("viewBox", "-20 0 350 350"); // Adjusted viewBox to fix label cutoff
	svg.style.margin = "auto"; // Center the SVG
	svg.setAttribute("preserveAspectRatio", "xMidYMid meet");


        // Define glow effect
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        defs.innerHTML = `
            <filter id="glow">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blurred" />
                <feMerge>
                    <feMergeNode in="blurred" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        `;
        svg.appendChild(defs);

        // Function to create a line
        const createLine = (x1, y1, x2, y2, color) => {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", x1);
            line.setAttribute("y1", y1);
            line.setAttribute("x2", x2);
            line.setAttribute("y2", y2);
            line.setAttribute("stroke", color);
            line.setAttribute("stroke-width", "5");
            line.classList.add("flow-lines");
            return line;
        };

        // Add flow lines
        if (this.solarData.P_Akku < -10 && this.solarData.P_PV > 0 ) {
            svg.appendChild(createLine(positions.PV.x, positions.PV.y + radius, positions.Akku.x, positions.Akku.y - radius, "#ffff00"));
        }
        if (this.solarData.P_PV > 5) {
            svg.appendChild(createLine(positions.PV.x + (radius * 0.7071), positions.PV.y + (radius * 0.7071), positions.House.x - (radius * 0.7071), positions.House.y - (radius * 0.7071), "#ffff00"));
        }
        if (this.solarData.P_Grid > 10) {
            svg.appendChild(createLine(positions.Grid.x - (radius * 0.7071), positions.Grid.y + (radius * 0.7071), positions.House.x + (radius * 0.7071), positions.House.y - (radius * 0.7071), "#808080"));
        }
        if (this.solarData.P_Akku > 10) {
            svg.appendChild(createLine(positions.Akku.x + (radius * 0.7071), positions.Akku.y - (radius * 0.7071), positions.House.x - (radius * 0.7071), positions.House.y + (radius * 0.7071), "#00ff00"));
        }
        if (this.solarData.P_Grid < -10 && this.solarData.P_PV > Math.abs(this.solarData.P_Grid)) {
            svg.appendChild(createLine(positions.PV.x + radius, positions.PV.y, positions.Grid.x - radius, positions.Grid.y, "#add8e6"));
        }
        if (this.solarData.P_Grid < -10 && this.solarData.P_PV <= 0) {
            svg.appendChild(createLine(positions.House.x + (radius * 0.7071), positions.House.y - (radius * 0.7071), positions.Grid.x - (radius * 0.7071), positions.Grid.y + (radius * 0.7071), "#00ff00"));
        }
	 if (this.solarData.P_PV <= 0 && this.solarData.P_Akku < -10) {
            svg.appendChild(createLine(positions.House.x - (radius * 0.7071), positions.House.y + (radius * 0.7071), positions.Akku.x + (radius * 0.7071), positions.Akku.y - (radius * 0.7071), "#808080"));
        }
	 if (this.solarData.P_Shelly > 0) {
            svg.appendChild(createLine(positions.Shelly.x - (radius * 0.7071), positions.Shelly.y - (radius * 0.7071), positions.House.x + (radius * 0.7071), positions.House.y + (radius * 0.7071), "#ffff00"));
        }
	 if (outerPower < 0 && this.solarData.P_Grid < 0) {
            svg.appendChild(createLine(positions.Shelly.x, positions.Shelly.y - radius, positions.Grid.x, positions.Grid.y + radius, "#add8e6"));
        }

        // Function to create a gauge
        const createGauge = ( label, icon, labelPosition, x, y, mainValue, subValue, percentage, color) => {
            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            group.setAttribute("transform", `translate(${x},${y})`);

            // Circle Background
            const bgCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            bgCircle.setAttribute("cx", 0);
            bgCircle.setAttribute("cy", 0);
            bgCircle.setAttribute("r", radius);
            bgCircle.setAttribute("stroke", "#e0e0e0");
            bgCircle.setAttribute("opacity", "1");
	    bgCircle.setAttribute("stroke-width", strokeWidth);
            bgCircle.setAttribute("fill", "none");
            group.appendChild(bgCircle);

            // Circle Progress with glow
            const progressCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            progressCircle.setAttribute("cx", 0);
            progressCircle.setAttribute("cy", 0);
            progressCircle.setAttribute("r", radius);
            progressCircle.setAttribute("stroke", color);
            progressCircle.setAttribute("stroke-width", strokeWidth);
            progressCircle.setAttribute("fill", "none");
            progressCircle.setAttribute("stroke-dasharray", `${percentage * 2 * Math.PI * radius} ${2 * Math.PI * radius}`);
            progressCircle.setAttribute("transform", "rotate(-90 0 0)");
            progressCircle.setAttribute("filter", "url(#glow)"); // Apply glow filter
            group.appendChild(progressCircle);

            // Main Text
            const mainText = document.createElementNS("http://www.w3.org/2000/svg", "text");
            mainText.setAttribute("x", 0);
            mainText.setAttribute("y", 6); // Adjusted y position for main text
            mainText.setAttribute("text-anchor", "middle");
            mainText.setAttribute("font-size", "22px");
            mainText.setAttribute("fill", "#ffffff");
            mainText.textContent = mainValue;
            group.appendChild(mainText);

            // Sub Text
            if (subValue) {
                const subText = document.createElementNS("http://www.w3.org/2000/svg", "text");
                subText.setAttribute("x", 0);
                subText.setAttribute("y", 25); // Adjusted y position for sub text
                subText.setAttribute("text-anchor", "middle");
                subText.setAttribute("font-size", "16px");
                subText.setAttribute("fill", "#ffffff");
                subText.textContent = subValue;
                group.appendChild(subText);
            }

	const labelY = labelPosition === "top"
	    ? -(radius + 22) // Above the gauge
	    : labelPosition === "middle" ? +20 // Center of the gauge
	    : radius + 22; // Below the gauge
	
	// Create a temporary div to measure the label's dimensions
	const tempDiv = document.createElement("div");
	tempDiv.style.cssText = `
	    position: absolute;
	    visibility: hidden;
	    white-space: nowrap;
	    font-size: 20px;
	`;
	tempDiv.textContent = `${icon} ${label}`;
	document.body.appendChild(tempDiv);
	
	// Measure the label's width and height
	const measuredLabelWidth = tempDiv.offsetWidth+500;
	const measuredLabelHeight = tempDiv.offsetHeight;
	document.body.removeChild(tempDiv);
	
	// Dynamically set the x position based on the measured width
	const adjustedX = -(measuredLabelWidth / 2);
	
	// Dynamically adjust the y position if necessary for better vertical alignment
	const adjustedY = labelY - (measuredLabelHeight / 2);
	
	// Create the foreignObject for the label
	const labelContainer = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
	labelContainer.setAttribute("x", adjustedX);
	labelContainer.setAttribute("y", adjustedY);
	labelContainer.setAttribute("width", measuredLabelWidth);
	labelContainer.setAttribute("height", measuredLabelHeight);
	
	// Create the content inside the foreignObject
	const labelDiv = document.createElement("div");
	labelDiv.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
	labelDiv.style.cssText = `
	    display: flex;
	    align-items: center;
	    justify-content: center;
	    text-align: center;
	    font-size: 20px;
	    color: white;
	    width: 100%;
	    height: 100%;
	    white-space: nowrap;
	    overflow: hidden;
	    box-sizing: border-box;
	`;
	
	labelDiv.innerHTML = `
	    <span style="display: inline-block; vertical-align: middle; margin-right: 5px;">
	        <span class="iconify" data-icon="${icon}" style="font-size: 20px; color: white;"></span>
	    </span>
	    <span style="display: inline-block; vertical-align: middle;">${label}</span>
	`;
	
	labelContainer.appendChild(labelDiv);
	group.appendChild(labelContainer);
	
        return group;
        };

        // Add gauges to SVG
        svg.appendChild(createGauge( "PV", this.config.icons.P_PV, "top", positions.PV.x, positions.PV.y, `${this.solarData.P_PV || 0} W`, null, Math.min((this.solarData.P_PV || 0) / this.config.MaxPowerPV, 1), pvColor));
        svg.appendChild(createGauge( "Grid", this.config.icons.P_Grid, "top", positions.Grid.x, positions.Grid.y, `${this.solarData.P_Grid || 0} W`, null, Math.min(Math.abs(this.solarData.P_Grid || 0) / this.config.MaxPower, 1), gridColor));
        svg.appendChild(createGauge( "Akku", this.config.icons.P_Akku, "bottom", positions.Akku.x, positions.Akku.y, `${this.solarSOC || 0}%`, `${this.solarData.P_Akku || 0} W`, Math.min(this.solarSOC / 100, 1), akkuColor));
        svg.appendChild(createGauge( "", this.config.icons.P_Load, "middle", positions.House.x, positions.House.y, `${outerPower || 0} W`, null, Math.min(Math.abs(outerPower || 0) / this.config.MaxPower, 1), houseColor));
	svg.appendChild(createGauge( "PV Mini", this.config.icons.P_Shelly, "bottom", positions.Shelly.x, positions.Shelly.y, `${this.solarData.P_Shelly || 0} W`, null, Math.min((this.solarData.P_Shelly || 0) / this.config.MaxPowerShelly, 1), shellyColor));

        wrapper.appendChild(svg);
	
	// Add dynamic text message below the gauge
    	if (this.config.ShowText) {
        const textMessageDiv = document.createElement("div");
        textMessageDiv.className = "text-message4";

        const messageConfig = this.config.TextMessge || [];
        let selectedMessage = null;

	for (const message of messageConfig) {
	    if (
	        (message.about && this.solarData.P_Grid > parseInt(message.about)) ||
	        (message.less && this.solarData.P_Grid < parseInt(message.less))
	    ) {
	        // If no message is selected yet, or the new match is more specific
	        if (
	            !selectedMessage ||
	            (message.about && parseInt(message.about) > parseInt(selectedMessage.about || -Infinity)) ||
	            (message.less && parseInt(message.less) < parseInt(selectedMessage.less || Infinity))
	        ) {
	            selectedMessage = message;
	        }
	    }
	}

        if (selectedMessage) {
            textMessageDiv.innerHTML = `
                <span style="color: ${selectedMessage.color}; font-size: 18px;">
                    ${selectedMessage.Text}
                </span>
            `;
        } else {
            textMessageDiv.innerHTML = `
                <span style="color: #999; font-size: 16px;">
                    PV Anlage läuft...
                </span>
            `;
        }

        wrapper.appendChild(textMessageDiv);
    	}
		
        return wrapper;
    }
});